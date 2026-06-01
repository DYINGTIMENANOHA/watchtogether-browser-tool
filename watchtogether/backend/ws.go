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
	MaxRoomMembers      = 5
	HostReconnectWindow = 5 * time.Second // 房主断线后等待重连的窗口（短窗口兜底，deliberate leave 立刻解散）
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

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
		// 拒绝 HTML 特殊字符
		if r == '<' || r == '>' || r == '&' || r == '"' || r == '\'' || r == '`' {
			return fmt.Errorf("name contains invalid characters")
		}
		// 拒绝控制字符
		if r < 0x20 {
			return fmt.Errorf("name contains invalid characters")
		}
		// 只允许常见 Unicode：字母、数字、标点、CJK
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
			"sid":     sid,
			"name":    m.Name,
			"is_host": sid == room.HostSID,
		})
	}
	return list
}

func broadcastMemberList(room *Room) {
	msg := map[string]any{
		"type":    "member_list",
		"members": memberListPayload(room),
		"count":   len(room.Members),
	}
	room.Broadcast(msg, "")
}

func handleWS(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := GetIP(r)

		if !globalState.IncrWSCount(ip, cfg.WSMaxPerIP) {
			http.Error(w, "too many connections", http.StatusTooManyRequests)
			return
		}
		defer globalState.DecrWSCount(ip)

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Error().Err(err).Str("ip", ip).Msg("ws upgrade failed")
			return
		}
		defer conn.Close()

		// 限制单条消息大小 8KB
		conn.SetReadLimit(8192)

		roomID := r.URL.Query().Get("room_id")
		room, ok := globalState.GetRoom(roomID)
		if !ok {
			conn.WriteJSON(map[string]any{"type": "error", "message": "room not found"})
			return
		}

		// 等待 hello 消息
		conn.SetReadDeadline(time.Now().Add(10 * time.Second))
		var hello WSMessage
		if err := conn.ReadJSON(&hello); err != nil || hello.Type != "hello" {
			conn.WriteJSON(map[string]any{"type": "error", "message": "expected hello"})
			return
		}
		conn.SetReadDeadline(time.Time{})

		if err := validateName(hello.Name); err != nil {
			conn.WriteJSON(map[string]any{"type": "error", "message": err.Error()})
			return
		}
		if hello.ClientID == "" {
			conn.WriteJSON(map[string]any{"type": "error", "message": "client_id required"})
			return
		}

		clientID := hello.ClientID
		sid := hello.Name + "_" + uuid.New().String()[:6]

		member := &Member{
			SID:      sid,
			ClientID: clientID,
			Name:     hello.Name,
			Conn:     conn,
		}

		room.Lock()

		isHostReconnect := room.HostReconnecting && room.HostClientID == clientID
		isFirstMember := room.HostSID == "" && !room.HostReconnecting

		if !isFirstMember && !isHostReconnect {
			// 普通房客加入时：检查是否试图加入自己创建的房间
			if room.HostClientID == clientID {
				room.Unlock()
				conn.WriteJSON(map[string]any{"type": "error", "message": "cannot join your own room"})
				return
			}
			// 检查人数上限（不含正在重连的房主空位）
			if len(room.Members) >= MaxRoomMembers {
				room.Unlock()
				conn.WriteJSON(map[string]any{"type": "error", "message": "room full"})
				return
			}
		}

		// 检查同 clientId 是否已有连接（踢旧连接）
		if oldSID, exists := room.ClientIDs[clientID]; exists {
			if oldMember, ok := room.Members[oldSID]; ok {
				log.Info().Str("room_id", roomID).Str("client_id", clientID).Msg("kicking old connection for same client")
				_ = oldMember.Send(map[string]any{"type": "kicked", "reason": "reconnected from another tab"})
				go oldMember.Conn.Close()
				delete(room.Members, oldSID)
			}
		}

		// 注册新连接
		room.ClientIDs[clientID] = sid
		room.Members[sid] = member

		var isHost bool
		if isFirstMember {
			room.HostSID = sid
			room.HostClientID = clientID
			isHost = true
		} else if isHostReconnect {
			// 房主重连
			room.HostSID = sid
			isHost = true
			if room.HostReconnectTimer != nil {
				room.HostReconnectTimer.Stop()
				room.HostReconnectTimer = nil
			}
			room.HostReconnecting = false
			log.Info().Str("room_id", roomID).Str("host", hello.Name).Msg("host reconnected")
		} else {
			isHost = false
		}

		room.LastActivity = time.Now()
		room.Unlock()

		// 发送欢迎消息
		conn.WriteJSON(map[string]any{
			"type":    "welcome",
			"sid":     sid,
			"is_host": isHost,
			"room_id": roomID,
		})

		// 广播成员变更
		room.Lock()
		if isHostReconnect {
			// 通知所有房客房主回来了
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
		heartbeatTicker := time.NewTicker(30 * time.Second)
		defer heartbeatTicker.Stop()

		go func() {
			for range heartbeatTicker.C {
				if err := conn.WriteJSON(map[string]any{"type": "ping"}); err != nil {
					return
				}
			}
		}()

		conn.SetReadDeadline(time.Now().Add(time.Duration(cfg.HeartbeatTimeout) * time.Second))

		deliberateLeave := false // 区分主动退出 vs 断线

		for {
			var msg WSMessage
			if err := conn.ReadJSON(&msg); err != nil {
				break
			}
			conn.SetReadDeadline(time.Now().Add(time.Duration(cfg.HeartbeatTimeout) * time.Second))

			if !rateTracker.Allow(cfg.WSMsgPerSec) {
				continue
			}

			room.Lock()
			room.LastActivity = time.Now()

			switch msg.Type {
			case "pong", "heartbeat":

			case "sync_action":
				if sid == room.HostSID || room.GuestControlAllowed {
					if validateSeekTime(msg.SeekTime) {
						handleSyncAction(room, member, msg, cfg)
					}
				}

			case "veto":
				// 任何人都可以否决（房主也可以否决房客发起的操作）
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
				// 房主手动同步所有人到当前视频，不改变房间状态
				if sid == room.HostSID {
					notifyMsg := map[string]any{
						"type":      "host_switched",
						"video_id":  room.VideoID,
						"platform":  room.Platform,
						"is_live":   room.IsLive,
						"host_name": hello.Name,
						"sync_all":  true,
					}
					for s, m := range room.Members {
						if s != sid {
							_ = m.Send(notifyMsg)
						}
					}
					log.Info().Str("room_id", room.RoomID).Msg("host sent sync_all")
				}

			case "host_transferred":
				// 房主将房间转移到新地址，广播给所有房客
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

			case "leave":
				deliberateLeave = true
				room.Unlock()
				goto cleanup
			}

			room.Unlock()
		}

	cleanup:
		room.Lock()

		// 如果该成员已经被踢走（同 clientId 新连接已替换），跳过清理
		currentSID, clientStillRegistered := room.ClientIDs[clientID]
		if !clientStillRegistered || currentSID != sid {
			room.Unlock()
			goto done
		}

		{
			delete(room.Members, sid)
			delete(room.ClientIDs, clientID)
			wasHost := room.HostSID == sid

			if wasHost {
				if deliberateLeave || len(room.Members) == 0 {
					// 主动退出或无成员 → 立刻解散房间
					for _, m := range room.Members {
						_ = m.Send(map[string]any{"type": "room_lost", "host_name": hello.Name})
					}
					room.Unlock()
					globalState.DeleteRoom(roomID)
					log.Info().Str("room_id", roomID).Str("host", hello.Name).Bool("deliberate", deliberateLeave).Msg("room dissolved: host left")
				} else {
					// 断线 → 给房主 HostReconnectWindow 时间重连
					room.HostSID = ""
					room.HostReconnecting = true
					hostName := hello.Name

					for _, m := range room.Members {
						_ = m.Send(map[string]any{
							"type":      "host_reconnecting",
							"host_name": hostName,
						})
					}

					roomCopy := room
					room.HostReconnectTimer = time.AfterFunc(HostReconnectWindow, func() {
						roomCopy.Lock()
						if !roomCopy.HostReconnecting {
							roomCopy.Unlock()
							return
						}
						// 超时，解散房间
						for _, m := range roomCopy.Members {
							_ = m.Send(map[string]any{"type": "room_lost", "host_name": hostName})
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
		}

	done:
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
		room.Paused = false
	} else if action == "pause" {
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
			"host_name":     sender.Name, // 发起人（可能是房客）
			"delay_seconds": room.VetoSeconds,
		}
		// 发给除发起人外所有成员（含房主）
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
			// seek 动作：使用发起人请求的原始时间点，防止被房主 position_update 覆盖后丢失进度
			// play/pause 动作：使用当前房间状态
			seekTarget := r.CurrentTime
			if pa.Action == "seek" {
				seekTarget = pa.SeekTime
				r.CurrentTime = pa.SeekTime
			}
			catchUpMsg := map[string]any{
				"type":      "catch_up_result",
				"seek_time": seekTarget,
				"paused":    r.Paused,
			}
			for sid, m := range r.Members {
				if sid != pa.SenderSID { // 发起人已经在该位置，跳过
					_ = m.Send(catchUpMsg)
				}
			}
		})
		return
	}

	executeSyncAction(room, action, seekTime, sender.SID)
}

// executeSyncAction 向除发起人外的所有成员发送同步指令。
// 调用方必须已持有 room.Lock()（写锁）。
func executeSyncAction(room *Room, action string, seekTime float64, senderSID string) {
	msg := map[string]any{
		"type":      "sync_apply",
		"action":    action,
		"seek_time": seekTime,
	}
	for sid, m := range room.Members {
		if sid == senderSID { // 跳过发起人，其余所有人（含房主）都同步
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
	_ = member.Send(map[string]any{
		"type":      "catch_up_result",
		"seek_time": room.CurrentTime,
		"paused":    room.Paused,
	})
}

func handleVideoChanged(room *Room, host *Member, msg WSMessage) {
	room.VideoID = msg.VideoID
	room.Platform = msg.Platform
	room.IsLive = msg.IsLive
	room.CurrentTime = 0
	room.HostSearching = false

	notifyMsg := map[string]any{
		"type":      "host_switched",
		"video_id":  msg.VideoID,
		"platform":  msg.Platform,
		"is_live":   msg.IsLive,
		"host_name": host.Name,
	}
	for sid, m := range room.Members {
		if sid != room.HostSID {
			_ = m.Send(notifyMsg)
		}
	}
	log.Info().Str("room_id", room.RoomID).Str("video_id", msg.VideoID).Str("platform", msg.Platform).Msg("host switched video")
}
