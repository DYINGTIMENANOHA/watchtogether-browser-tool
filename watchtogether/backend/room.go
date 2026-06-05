package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"runtime"
	"time"

	"github.com/rs/zerolog/log"
)

const tokenChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func isSupportedPlatform(platform string) bool {
	return platform == "youtube" || platform == "bilibili"
}

func generateID(length int) string {
	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(tokenChars))))
		b[i] = tokenChars[n.Int64()]
	}
	return string(b)
}

// POST /room/create
func handleCreateRoom(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := GetIP(r)

		if globalState.RoomCount() >= cfg.MaxRooms {
			http.Error(w, `{"error":"server full"}`, http.StatusServiceUnavailable)
			return
		}

		if !globalState.CheckRateLimit(ip, cfg.RateLimitPerMin) {
			metricRateLimitHits.Inc()
			log.Warn().Str("ip", ip).Msg("rate limit hit on room create")
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			return
		}

		var req CreateRoomRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}
		if req.HostName == "" || req.Platform == "" {
			http.Error(w, `{"error":"missing fields"}`, http.StatusBadRequest)
			return
		}
		if !isSupportedPlatform(req.Platform) {
			http.Error(w, `{"error":"unsupported platform"}`, http.StatusBadRequest)
			return
		}
		if err := validateName(req.HostName); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		if req.ClientID == "" {
			http.Error(w, `{"error":"client_id required"}`, http.StatusBadRequest)
			return
		}

		roomID := generateID(8)
		token := generateID(8)

		room := &Room{
			RoomID:       roomID,
			Token:        token,
			HostName:     req.HostName,
			HostClientID: req.ClientID,
			VideoID:      req.VideoID,
			Platform:     req.Platform,
			Title:        req.Title,
			CurrentTime:  req.Time,
			Paused:       req.Paused,
			IsLive:       req.IsLive,
			VetoEnabled:  false,
			VetoSeconds:  5,
			Members:      make(map[string]*Member),
			ClientIDs:    make(map[string]string),
			CreatedAt:    time.Now(),
			TokenExpires: time.Now().Add(time.Duration(cfg.RoomTTLMinutes) * time.Minute),
			LastActivity: time.Now(),
		}

		globalState.AddRoom(room)
		globalState.roomsCreatedToday.Add(1)
		metricRoomsCreated.Inc()
		metricPlatformRooms.WithLabelValues(req.Platform).Inc()

		log.Info().
			Str("room_id", roomID).
			Str("host", req.HostName).
			Str("platform", req.Platform).
			Str("video_id", req.VideoID).
			Str("ip", ip).
			Msg("room created")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(CreateRoomResponse{
			RoomID: roomID,
			Token:  token,
		})
	}
}

// POST /room/join
func handleJoinRoom(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := GetIP(r)

		if !globalState.CheckTokenBan(ip, cfg.TokenFailMax, cfg.TokenBanMinutes) {
			http.Error(w, `{"error":"too many failures, try later"}`, http.StatusTooManyRequests)
			return
		}

		var req JoinRoomRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}

		if req.GuestName == "" || req.Token == "" {
			http.Error(w, `{"error":"missing fields"}`, http.StatusBadRequest)
			return
		}
		if err := validateName(req.GuestName); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		room, ok := globalState.GetRoomByToken(req.Token)
		if !ok {
			globalState.RecordTokenFail(ip, cfg.TokenFailMax, cfg.TokenBanMinutes)
			metricTokenFailures.Inc()
			log.Warn().Str("ip", ip).Str("token", req.Token).Msg("invalid token")
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		room.RLock()
		if time.Now().After(room.TokenExpires) {
			room.RUnlock()
			globalState.RecordTokenFail(ip, cfg.TokenFailMax, cfg.TokenBanMinutes)
			http.Error(w, `{"error":"token expired"}`, http.StatusUnauthorized)
			return
		}

		if req.ClientID != "" && room.HostClientID == req.ClientID {
			room.RUnlock()
			http.Error(w, `{"error":"cannot join your own room"}`, http.StatusForbidden)
			return
		}

		resp := JoinRoomResponse{
			RoomID:        room.RoomID,
			HostName:      room.HostName,
			VideoID:       room.VideoID,
			Platform:      room.Platform,
			Title:         room.Title,
			CurrentTime:   room.CurrentTime,
			Paused:        room.Paused,
			IsLive:        room.IsLive,
			HostSearching: room.HostSearching,
		}
		room.RUnlock()

		room.Lock()
		room.LastActivity = time.Now()
		room.Unlock()

		globalState.RecordTokenSuccess(ip)
		globalState.roomsJoinedToday.Add(1)
		metricRoomsJoined.Inc()

		log.Info().
			Str("room_id", room.RoomID).
			Str("guest", req.GuestName).
			Str("ip", ip).
			Msg("room joined")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// GET /room/status
func handleStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var mem runtime.MemStats
		runtime.ReadMemStats(&mem)

		resp := StatusResponse{
			ActiveRooms:       globalState.RoomCount(),
			ActiveConnections: globalState.ConnectionCount(),
			RoomsCreatedToday: globalState.roomsCreatedToday.Load(),
			RoomsJoinedToday:  globalState.roomsJoinedToday.Load(),
			UptimeSeconds:     time.Since(globalState.startTime).Seconds(),
			MemoryMB:          mem.Alloc / 1024 / 1024,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func handleCheckRoom() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		token := r.URL.Query().Get("token")
		if token == "" {
			json.NewEncoder(w).Encode(CheckRoomResponse{Exists: false})
			return
		}
		room, ok := globalState.GetRoomByToken(token)
		if !ok {
			json.NewEncoder(w).Encode(CheckRoomResponse{Exists: false})
			return
		}
		room.RLock()
		expired := time.Now().After(room.TokenExpires)
		if expired {
			room.RUnlock()
			json.NewEncoder(w).Encode(CheckRoomResponse{Exists: false})
			return
		}
		resp := CheckRoomResponse{
			Exists:      true,
			HostName:    room.HostName,
			Platform:    room.Platform,
			VideoID:     room.VideoID,
			Title:       room.Title,
			MemberCount: len(room.Members),
		}
		room.RUnlock()
		json.NewEncoder(w).Encode(resp)
	}
}

func handleRefreshToken(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID := r.URL.Query().Get("room_id")
		hostSID := r.URL.Query().Get("host_sid")
		room, ok := globalState.GetRoom(roomID)
		if !ok {
			http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
			return
		}
		room.Lock()
		defer room.Unlock()
		if room.HostSID != hostSID {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		newToken := generateID(8)
		globalState.mu.Lock()
		delete(globalState.tokens, room.Token)
		room.Token = newToken
		room.TokenExpires = time.Now().Add(time.Duration(cfg.RoomTTLMinutes) * time.Minute)
		globalState.tokens[newToken] = room.RoomID
		globalState.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"token":"%s"}`, newToken)
	}
}
