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

func TestCleanupEnforcesAbsoluteIdleCeiling(t *testing.T) {
	useIsolatedState(t)

	room := &Room{
		RoomID:           "stale-room",
		Token:            "stale-token",
		HostReconnecting: true,
		Members:          map[string]*Member{"m1": {ClientID: "m1"}},
		ClientIDs:        make(map[string]string),
		LastActivity:     time.Now().Add(-4 * time.Hour),
	}
	globalState.AddRoom(room)

	// Even with members present and the host marked as reconnecting, a room
	// with no activity at all for longer than RoomMaxIdleMinutes must be
	// removed so it doesn't linger forever (e.g. host abandoned it after
	// switching IP/login without a clean disconnect).
	cleanExpiredRooms(Config{RoomTTLMinutes: 60, RoomMaxIdleMinutes: 180})
	if _, ok := globalState.GetRoom(room.RoomID); ok {
		t.Fatal("cleanup did not enforce the absolute idle ceiling")
	}
}

func TestRoomMaxIdleWindowDefaultsToThreeHours(t *testing.T) {
	if got := roomMaxIdleWindow(Config{}); got != 3*time.Hour {
		t.Fatalf("default max idle window = %v, want 3h", got)
	}
	if got := roomMaxIdleWindow(Config{RoomMaxIdleMinutes: 30}); got != 30*time.Minute {
		t.Fatalf("configured max idle window = %v, want 30m", got)
	}
}

func TestHostReconnectWindowDefaultsToThreeHours(t *testing.T) {
	if got := hostReconnectWindow(Config{}); got != 3*time.Hour {
		t.Fatalf("default reconnect window = %v, want 3h", got)
	}
	if got := hostReconnectWindow(Config{HostReconnectMinutes: 15}); got != 15*time.Minute {
		t.Fatalf("configured reconnect window = %v, want 15m", got)
	}
}

func TestCreatingNewRoomClosesExistingRoomsForHost(t *testing.T) {
	useIsolatedState(t)

	oldRoom := &Room{
		RoomID:             "old-room",
		Token:              "old-token",
		HostClientID:       "same-host",
		HostReconnecting:   true,
		HostReconnectTimer: time.AfterFunc(time.Hour, func() {}),
		Members:            make(map[string]*Member),
		ClientIDs:          make(map[string]string),
	}
	otherRoom := &Room{
		RoomID:       "other-room",
		Token:        "other-token",
		HostClientID: "other-host",
		Members:      make(map[string]*Member),
		ClientIDs:    make(map[string]string),
	}
	globalState.AddRoom(oldRoom)
	globalState.AddRoom(otherRoom)

	closeExistingHostRooms("same-host")

	if _, ok := globalState.GetRoom(oldRoom.RoomID); ok {
		t.Fatal("old room for the same host was not removed")
	}
	if _, ok := globalState.GetRoom(otherRoom.RoomID); !ok {
		t.Fatal("room belonging to another host was removed")
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
