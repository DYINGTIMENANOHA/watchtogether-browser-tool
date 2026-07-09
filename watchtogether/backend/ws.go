package main

import (
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

const (
	HostReconnectWindow = 3 * time.Minute
	HeartbeatInterval   = 15 * time.Second
)

type msgRateTracker struct {
	mu    sync.Mutex
	count int
	reset time.Time
}

func (t *msgRateTracker) Allow(maxPerSec int) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()
	if now.After(t.reset) {
		t.count = 0
		t.reset = now.Add(time.Second)
	}
	if t.count >= maxPerSec {
		return false
	}
	t.count++
	return true
}

func validateName(name string) error {
	runes := []rune(name)
	if len(runes) < 1 || len(runes) > 20 {
		return fmt.Errorf("name must be 1-20 characters")
	}
	for _, r := range runes {
		if r == '<' || r == '>' || r == '&' || r == '"' || r == '\'' || r == '`' {
			return fmt.Errorf("name contains invalid characters")
		}
		if r < 0x20 {
			return fmt.Errorf("name contains invalid characters")
		}
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && !unicode.IsPunct(r) &&
			!unicode.IsSpace(r) && !unicode.IsSymbol(r) {
			return fmt.Errorf("name contains unsupported characters")
		}
	}
	return nil
}

func validateSeekTime(t float64) bool {
	return !math.IsNaN(t) && !math.IsInf(t, 0) && t >= 0
}

func memberListPayload(room *Room) []map[string]any {
	list := make([]map[string]any, 0, len(room.Members))
	for sid, m := range room.Members {
		list = append(list, map[string]any{
			"sid":          sid,
			"name":         m.Name,
			"is_host":      sid == room.HostSID,
			"status":       "online",
			"last_seen_ms": m.LastSeen.UnixMilli(),
		})
	}
	if room.HostReconnecting && room.HostSID == "" && room.HostName != "" {
		list = append(list, map[string]any{
			"sid":          "host_reconnecting",
			"name":         room.HostName,
			"is_host":      true,
			"status":       "reconnecting",
			"last_seen_ms": room.LastActivity.UnixMilli(),
		})
	}
	return list
}

func broadcastMemberList(room *Room) {
	members := memberListPayload(room)
	room.Broadcast(map[string]any{
		"type":    "member_list",
		"members": members,
		"count":   len(members),
	}, "")
}

func handleWS(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isOriginAllowed(cfg, r.Header.Get("Origin")) {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		if !hasValidClientToken(cfg, r) {
			http.Error(w, "invalid client token", http.StatusUnauthorized)
			return
		}

		ip := GetIP(r)
		if !globalState.IncrWSCount(ip, cfg.WSMaxPerIP) {
			http.Error(w, "too many connections", http.StatusTooManyRequests)
			return
		}
		defer globalState.DecrWSCount(ip)

		upgrader := websocket.Upgrader{
			CheckOrigin: func(req *http.Request) bool {
				return isOriginAllowed(cfg, req.Header.Get("Origin"))
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Error().Err(err).Str("ip", ip).Msg("ws upgrade failed")
			return
		}
		defer conn.Close()

		conn.SetReadLimit(8192)

		roomID := r.URL.Query().Get("room_id")
		room, ok := globalState.GetRoom(roomID)
		if !ok {
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "room not found"})
			return
		}

		conn.SetReadDeadline(time.Now().Add(10 * time.Second))
		var hello WSMessage
		if err := conn.ReadJSON(&hello); err != nil || hello.Type != "hello" {
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "expected hello"})
			return
		}
		conn.SetReadDeadline(time.Time{})

		if err := validateName(hello.Name); err != nil {
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": err.Error()})
			return
		}
		if hello.ClientID == "" {
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "client_id required"})
			return
		}

		clientID := hello.ClientID
		sid := hello.Name + "_" + uuid.New().String()[:6]
		member := &Member{
			SID:      sid,
			ClientID: clientID,
			Name:     hello.Name,
			Conn:     conn,
			LastSeen: time.Now(),
		}

		room.Lock()
		if room.Closed {
			room.Unlock()
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "room not found"})
			return
		}
		isHostReconnect := room.HostClientID == clientID &&
			(room.HostReconnecting || room.HostSID != "")
		isFirstMember := room.HostSID == "" && !room.HostReconnecting

		if !isFirstMember && !isHostReconnect {
			if room.HostClientID == clientID {
				room.Unlock()
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "cannot join your own room"})
				return
			}
			if len(room.Members) >= cfg.MaxRoomMembers {
				room.Unlock()
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": "room full"})
				return
			}
		}

		if oldSID, exists := room.ClientIDs[clientID]; exists {
			if oldMember, ok := room.Members[oldSID]; ok {
				log.Info().Str("room_id", roomID).Str("client_id", clientID).Msg("kicking old connection for same client")
				_ = oldMember.Send(map[string]any{"type": "kicked", "reason": "reconnected from another tab"})
				go oldMember.Conn.Close()
				delete(room.Members, oldSID)
			}
		}

		room.ClientIDs[clientID] = sid
		room.Members[sid] = member

		var isHost bool
		if isFirstMember {
			room.HostSID = sid
			room.HostClientID = clientID
			room.HostName = hello.Name
			isHost = true
		} else if isHostReconnect {
			room.HostSID = sid
			room.HostName = hello.Name
			isHost = true
			if room.HostReconnectTimer != nil {
				room.HostReconnectTimer.Stop()
				room.HostReconnectTimer = nil
			}
			room.HostReconnecting = false
			log.Info().Str("room_id", roomID).Str("host", hello.Name).Msg("host reconnected")
		}

		room.LastActivity = time.Now()
		room.TokenExpires = room.LastActivity.Add(time.Duration(cfg.RoomTTLMinutes) * time.Minute)
		room.Unlock()

		_ = member.Send(map[string]any{
			"type":    "welcome",
			"sid":     sid,
			"is_host": isHost,
			"room_id": roomID,
		})

		room.Lock()
		if isHostReconnect {
			for s, m := range room.Members {
				if s != sid {
					_ = m.Send(map[string]any{"type": "host_reconnected", "host_name": hello.Name})
				}
			}
		} else if !isHost {
			room.Broadcast(map[string]any{
				"type": "member_joined",
				"sid":  sid,
				"name": hello.Name,
			}, sid)
			log.Info().Str("room_id", roomID).Str("member", hello.Name).Msg("member joined")
		} else {
			log.Info().Str("room_id", roomID).Str("host", hello.Name).Msg("host connected")
		}
		broadcastMemberList(room)
		room.Unlock()

		UpdateGauges()

		rateTracker := &msgRateTracker{}
		heartbeatTicker := time.NewTicker(HeartbeatInterval)
		defer heartbeatTicker.Stop()

		go func() {
			for range heartbeatTicker.C {
				if err := member.Ping(); err != nil {
					return
				}
				if err := member.Send(map[string]any{"type": "ping"}); err != nil {
					return
				}
			}
		}()

		heartbeatTimeout := time.Duration(cfg.HeartbeatTimeout) * time.Second
		conn.SetReadDeadline(time.Now().Add(heartbeatTimeout))
		conn.SetPongHandler(func(string) error {
			return conn.SetReadDeadline(time.Now().Add(heartbeatTimeout))
		})
		deliberateLeave := false

		for {
			var msg WSMessage
			if err := conn.ReadJSON(&msg); err != nil {
				break
			}
			conn.SetReadDeadline(time.Now().Add(heartbeatTimeout))

			if !rateTracker.Allow(cfg.WSMsgPerSec) {
				continue
			}

			room.Lock()
			room.LastActivity = time.Now()
			room.TokenExpires = room.LastActivity.Add(time.Duration(cfg.RoomTTLMinutes) * time.Minute)
			member.LastSeen = room.LastActivity

			switch msg.Type {
			case "pong", "heartbeat":

			case "sync_action":
				if sid == room.HostSID || room.GuestControlAllowed {
					if validateSeekTime(msg.SeekTime) {
						handleSyncAction(room, member, msg, cfg)
					}
				}

			case "veto":
				handleVeto(room, member)

			case "catch_up":
				if sid != room.HostSID {
					handleCatchUp(room, member)
				}

			case "position_update":
				if sid == room.HostSID && validateSeekTime(msg.SeekTime) {
					room.CurrentTime = msg.SeekTime
					room.Paused = msg.Action == "paused"
				}

			case "host_searching":
				if sid == room.HostSID {
					room.HostSearching = true
					for s, m := range room.Members {
						if s != room.HostSID {
							_ = m.Send(map[string]any{"type": "host_searching"})
						}
					}
				}

			case "video_changed":
				if sid == room.HostSID {
					handleVideoChanged(room, member, msg)
				}

			case "veto_config":
				if sid == room.HostSID {
					room.VetoEnabled = msg.Action == "true"
					if msg.SeekTime >= 3 && msg.SeekTime <= 30 {
						room.VetoSeconds = int(msg.SeekTime)
					}
				}

			case "guest_control_config":
				if sid == room.HostSID {
					room.GuestControlAllowed = msg.Allowed
				}

			case "sync_all":
				if sid == room.HostSID {
					if msg.VideoID == "" || (msg.Platform != "youtube" && msg.Platform != "bilibili") ||
						!validateSeekTime(msg.SeekTime) {
						_ = member.Send(map[string]any{
							"type":   "sync_all_error",
							"reason": "invalid_host_video",
						})
						break
					}
					room.VideoID = msg.VideoID
					room.Platform = msg.Platform
					room.IsLive = msg.IsLive
					room.CurrentTime = msg.SeekTime
					room.Paused = msg.Action == "paused"
					room.HostSearching = false
					notifyMsg := map[string]any{
						"type":      "host_switched",
						"video_id":  room.VideoID,
						"platform":  room.Platform,
						"is_live":   room.IsLive,
						"host_name": hello.Name,
						"sync_all":  true,
						"seek_time": room.CurrentTime,
						"paused":    room.Paused,
					}
					for s, m := range room.Members {
						if s != sid {
							_ = m.Send(notifyMsg)
						}
					}
					_ = member.Send(map[string]any{
						"type":  "sync_all_result",
						"count": len(room.Members) - 1,
					})
					log.Info().Str("room_id", room.RoomID).Msg("host sent sync_all")
				}

			case "host_transferred":
				if sid == room.HostSID && msg.NewToken != "" {
					transferMsg := map[string]any{
						"type":      "host_transferred",
						"new_token": msg.NewToken,
						"video_id":  msg.VideoID,
						"platform":  msg.Platform,
						"title":     msg.MsgTitle,
						"host_name": hello.Name,
					}
					for s, m := range room.Members {
						if s != sid {
							_ = m.Send(transferMsg)
						}
					}
				}

			case "transfer_host":
				if sid != room.HostSID {
					break
				}
				target, exists := room.Members[msg.TargetSID]
				if !exists {
					_ = member.Send(map[string]any{"type": "error", "message": "transfer_target_offline"})
					break
				}
				room.HostSID = msg.TargetSID
				room.HostClientID = target.ClientID
				room.HostName = target.Name
				room.HostSearching = false
				for s, m := range room.Members {
					switch s {
					case sid:
						_ = m.Send(map[string]any{"type": "you_are_guest", "new_host_name": target.Name})
					case msg.TargetSID:
						_ = m.Send(map[string]any{
							"type":          "host_changed",
							"new_host_sid":  msg.TargetSID,
							"new_host_name": target.Name,
							"old_host_name": hello.Name,
							"is_new_host":   true,
						})
					default:
						_ = m.Send(map[string]any{
							"type":          "host_changed",
							"new_host_sid":  msg.TargetSID,
							"new_host_name": target.Name,
							"old_host_name": hello.Name,
						})
					}
				}
				broadcastMemberList(room)
				log.Info().Str("room_id", room.RoomID).Str("from", hello.Name).Str("to", target.Name).Msg("host transferred")

			case "leave":
				deliberateLeave = true
				room.Unlock()
				goto cleanup
			}

			room.Unlock()
		}

	cleanup:
		room.Lock()

		currentSID, clientStillRegistered := room.ClientIDs[clientID]
		if !clientStillRegistered || currentSID != sid {
			room.Unlock()
			metricWSDisconnects.Inc()
			UpdateGauges()
			return
		}

		delete(room.Members, sid)
		delete(room.ClientIDs, clientID)
		wasHost := room.HostSID == sid

		if wasHost {
			if deliberateLeave {
				room.Closed = true
				for _, m := range room.Members {
					_ = m.Send(map[string]any{
						"type":      "room_lost",
						"host_name": hello.Name,
						"reason":    "host_left",
					})
				}
				room.Unlock()
				globalState.DeleteRoom(roomID)
				log.Info().Str("room_id", roomID).Str("host", hello.Name).Bool("deliberate", deliberateLeave).Msg("room dissolved: host left")
			} else {
				room.HostSID = ""
				room.HostReconnecting = true
				room.LastActivity = time.Now()
				hostName := hello.Name

				for _, m := range room.Members {
					_ = m.Send(map[string]any{
						"type":      "host_reconnecting",
						"host_name": hostName,
					})
				}
				broadcastMemberList(room)

				roomCopy := room
				room.HostReconnectTimer = time.AfterFunc(HostReconnectWindow, func() {
					roomCopy.Lock()
					if !roomCopy.HostReconnecting || roomCopy.Closed {
						roomCopy.Unlock()
						return
					}
					roomCopy.HostReconnecting = false
					roomCopy.Closed = true
					for _, m := range roomCopy.Members {
						_ = m.Send(map[string]any{
							"type":      "room_lost",
							"host_name": hostName,
							"reason":    "host_timeout",
						})
					}
					roomCopy.Unlock()
					globalState.DeleteRoom(roomID)
					log.Info().Str("room_id", roomID).Msg("room dissolved: host reconnect timeout")
				})

				room.Unlock()
				log.Info().Str("room_id", roomID).Str("host", hello.Name).Dur("window", HostReconnectWindow).Msg("host disconnected, waiting for reconnect")
			}
		} else {
			room.Broadcast(map[string]any{
				"type": "member_left",
				"sid":  sid,
				"name": hello.Name,
			}, "")
			broadcastMemberList(room)
			room.Unlock()
			log.Info().Str("room_id", roomID).Str("member", hello.Name).Msg("member left")
		}

		metricWSDisconnects.Inc()
		UpdateGauges()
	}
}

func handleSyncAction(room *Room, sender *Member, msg WSMessage, cfg Config) {
	action := msg.Action
	seekTime := msg.SeekTime

	if action == "seek" {
		room.CurrentTime = seekTime
	} else if action == "play" {
		room.CurrentTime = seekTime
		room.Paused = false
	} else if action == "pause" {
		room.CurrentTime = seekTime
		room.Paused = true
	}

	metricSyncActions.WithLabelValues(action).Inc()

	if room.VetoEnabled && !room.IsLive {
		if room.PendingAction != nil && room.PendingAction.Timer != nil {
			room.PendingAction.Timer.Stop()
		}
		delay := time.Duration(room.VetoSeconds) * time.Second
		pa := &PendingAction{
			Action:    action,
			SeekTime:  seekTime,
			SenderSID: sender.SID,
		}
		room.PendingAction = pa

		syncMsg := map[string]any{
			"type":          "sync_opportunity",
			"action":        action,
			"seek_time":     seekTime,
			"host_name":     sender.Name,
			"delay_seconds": room.VetoSeconds,
		}
		for sid, m := range room.Members {
			if sid != sender.SID {
				_ = m.Send(syncMsg)
			}
		}

		roomID := room.RoomID
		pa.Timer = time.AfterFunc(delay, func() {
			r, ok := globalState.GetRoom(roomID)
			if !ok {
				return
			}
			r.Lock()
			defer r.Unlock()
			if r.PendingAction != pa {
				return
			}
			r.PendingAction = nil

			seekTarget := r.CurrentTime
			if pa.Action == "seek" {
				seekTarget = pa.SeekTime
				r.CurrentTime = pa.SeekTime
			}
			catchUpMsg := map[string]any{
				"type":      "catch_up_result",
				"seek_time": seekTarget,
				"paused":    r.Paused,
				"video_id":  r.VideoID,
				"platform":  r.Platform,
			}
			for sid, m := range r.Members {
				if sid != pa.SenderSID {
					_ = m.Send(catchUpMsg)
				}
			}
		})
		return
	}

	executeSyncAction(room, action, seekTime, sender.SID)
}

func executeSyncAction(room *Room, action string, seekTime float64, senderSID string) {
	msg := map[string]any{
		"type":      "sync_apply",
		"action":    action,
		"seek_time": seekTime,
		"video_id":  room.VideoID,
		"platform":  room.Platform,
	}
	for sid, m := range room.Members {
		if sid == senderSID {
			continue
		}
		_ = m.Send(msg)
	}
}

func handleVeto(room *Room, member *Member) {
	if room.PendingAction == nil {
		return
	}
	if room.PendingAction.Timer != nil {
		room.PendingAction.Timer.Stop()
	}
	room.PendingAction = nil
	metricVetoCount.Inc()

	room.Broadcast(map[string]any{
		"type":        "sync_vetoed",
		"member_name": member.Name,
	}, "")
	log.Info().Str("room_id", room.RoomID).Str("member", member.Name).Msg("sync vetoed")
}

func handleCatchUp(room *Room, member *Member) {
	if room.HostSearching || room.VideoID == "" ||
		(room.Platform != "youtube" && room.Platform != "bilibili") {
		_ = member.Send(map[string]any{
			"type":   "catch_up_error",
			"reason": "host_video_unavailable",
		})
		return
	}
	_ = member.Send(map[string]any{
		"type":      "catch_up_result",
		"seek_time": room.CurrentTime,
		"paused":    room.Paused,
		"video_id":  room.VideoID,
		"platform":  room.Platform,
	})
}

func handleVideoChanged(room *Room, host *Member, msg WSMessage) {
	room.VideoID = msg.VideoID
	room.Platform = msg.Platform
	room.IsLive = msg.IsLive
	if validateSeekTime(msg.SeekTime) {
		room.CurrentTime = msg.SeekTime
	} else {
		room.CurrentTime = 0
	}
	room.Paused = msg.Action == "paused"
	room.HostSearching = false

	notifyMsg := map[string]any{
		"type":      "host_switched",
		"video_id":  msg.VideoID,
		"platform":  msg.Platform,
		"is_live":   msg.IsLive,
		"host_name": host.Name,
		"seek_time": room.CurrentTime,
		"paused":    room.Paused,
	}
	for sid, m := range room.Members {
		if sid != room.HostSID {
			_ = m.Send(notifyMsg)
		}
	}
	log.Info().Str("room_id", room.RoomID).Str("video_id", msg.VideoID).Str("platform", msg.Platform).Msg("host switched video")
}
