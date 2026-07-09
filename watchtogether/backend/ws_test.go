package main

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestSoloHostCanReconnectAfterUnexpectedDisconnect(t *testing.T) {
	useIsolatedState(t)

	room := &Room{
		RoomID:       "room-test",
		Token:        "token-test",
		HostName:     "Host",
		HostClientID: "host-client",
		VideoID:      "video-test",
		Platform:     "youtube",
		Paused:       true,
		Members:      make(map[string]*Member),
		ClientIDs:    make(map[string]string),
		CreatedAt:    time.Now(),
		TokenExpires: time.Now().Add(time.Hour),
		LastActivity: time.Now(),
	}
	globalState.AddRoom(room)

	cfg := Config{
		MaxRoomMembers:   25,
		RoomTTLMinutes:   60,
		WSMaxPerIP:       20,
		WSMsgPerSec:      10,
		HeartbeatTimeout: 5,
	}
	server := httptest.NewServer(handleWS(cfg))
	t.Cleanup(server.Close)
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/wt/ws?room_id=" + room.RoomID

	connect := func() *websocket.Conn {
		t.Helper()
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("dial websocket: %v", err)
		}
		if err := conn.WriteJSON(WSMessage{
			Type:     "hello",
			Name:     "Host",
			ClientID: "host-client",
		}); err != nil {
			t.Fatalf("send hello: %v", err)
		}
		var welcome struct {
			Type   string `json:"type"`
			IsHost bool   `json:"is_host"`
		}
		if err := conn.ReadJSON(&welcome); err != nil {
			t.Fatalf("read welcome: %v", err)
		}
		if welcome.Type != "welcome" || !welcome.IsHost {
			t.Fatalf("unexpected welcome: %+v", welcome)
		}
		return conn
	}

	first := connect()
	room.RLock()
	tokenExpires := room.TokenExpires
	room.RUnlock()
	if time.Until(tokenExpires) < 59*time.Minute {
		t.Fatalf("active room token expiry was not extended: %v", tokenExpires)
	}
	replacement := connect()
	_ = first.Close()
	if err := replacement.Close(); err != nil {
		t.Fatalf("close replacement connection: %v", err)
	}

	waitFor(t, time.Second, func() bool {
		room.RLock()
		defer room.RUnlock()
		return room.HostReconnecting && room.HostSID == "" && len(room.Members) == 0
	})
	if _, ok := globalState.GetRoom(room.RoomID); !ok {
		t.Fatal("room was deleted while the solo host was eligible to reconnect")
	}

	second := connect()
	room.RLock()
	reconnecting := room.HostReconnecting
	hostSID := room.HostSID
	room.RUnlock()
	if reconnecting || hostSID == "" {
		t.Fatalf("host reconnect did not restore room state: reconnecting=%v hostSID=%q", reconnecting, hostSID)
	}

	if err := second.WriteJSON(WSMessage{Type: "leave"}); err != nil {
		t.Fatalf("send deliberate leave: %v", err)
	}
	waitFor(t, time.Second, func() bool {
		_, ok := globalState.GetRoom(room.RoomID)
		return !ok
	})
	_ = second.Close()
}

func TestCleanupPreservesHostReconnectWindow(t *testing.T) {
	useIsolatedState(t)

	room := &Room{
		RoomID:           "reconnecting-room",
		Token:            "reconnecting-token",
		HostReconnecting: true,
		Members:          make(map[string]*Member),
		ClientIDs:        make(map[string]string),
		LastActivity:     time.Now().Add(-time.Hour),
	}
	globalState.AddRoom(room)

	cleanExpiredRooms(Config{RoomTTLMinutes: 1})
	if _, ok := globalState.GetRoom(room.RoomID); !ok {
		t.Fatal("cleanup deleted a room during the host reconnect window")
	}

	room.Lock()
	room.HostReconnecting = false
	room.Unlock()
	cleanExpiredRooms(Config{RoomTTLMinutes: 1})
	if _, ok := globalState.GetRoom(room.RoomID); ok {
		t.Fatal("cleanup did not delete an expired inactive room")
	}
}

func useIsolatedState(t *testing.T) {
	t.Helper()
	previousState := globalState
	globalState = &State{
		rooms:       make(map[string]*Room),
		tokens:      make(map[string]string),
		ipRateLimit: make(map[string]*ipCounter),
		ipTokenFail: make(map[string]*ipBanInfo),
		ipWSCount:   make(map[string]int),
		startTime:   time.Now(),
	}
	t.Cleanup(func() { globalState = previousState })
}

func waitFor(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition was not met before timeout")
}
