package main

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Member struct {
	SID      string
	ClientID string
	Name     string
	Conn     *websocket.Conn
	mu       sync.Mutex
}

func (m *Member) Send(msg map[string]any) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.Conn.WriteJSON(msg)
}

type Room struct {
	RoomID              string
	Token               string
	HostSID             string
	HostClientID        string            // 房主 clientId，防止同浏览器同时为房主和房客
	HostName            string
	HostSearching       bool              // 房主正在找视频（未在任何视频页面）
	HostReconnecting    bool              // 房主已断线，等待重连
	HostReconnectTimer  *time.Timer       // 重连超时计时器（超时后解散房间）
	VideoID             string
	Platform            string
	Title               string
	CurrentTime         float64
	Paused              bool
	IsLive              bool
	VetoEnabled         bool
	VetoSeconds         int
	GuestControlAllowed bool
	Members             map[string]*Member
	ClientIDs           map[string]string // clientId → sid，用于踢旧连接/重连识别
	CreatedAt           time.Time
	TokenExpires        time.Time
	LastActivity        time.Time
	mu                  sync.RWMutex
	PendingAction       *PendingAction
}

func (r *Room) Lock()    { r.mu.Lock() }
func (r *Room) Unlock()  { r.mu.Unlock() }
func (r *Room) RLock()   { r.mu.RLock() }
func (r *Room) RUnlock() { r.mu.RUnlock() }

func (r *Room) Broadcast(msg map[string]any, excludeSID string) {
	for sid, m := range r.Members {
		if sid == excludeSID {
			continue
		}
		_ = m.Send(msg)
	}
}

type PendingAction struct {
	Action    string
	SeekTime  float64
	SenderSID string // 触发此操作的成员 SID，同步时排除该成员（避免回声）
	Timer     *time.Timer
}

type WSMessage struct {
	Type     string  `json:"type"`
	Action   string  `json:"action,omitempty"`
	SeekTime float64 `json:"seek_time,omitempty"`
	VideoID  string  `json:"video_id,omitempty"`
	Platform string  `json:"platform,omitempty"`
	IsLive   bool    `json:"is_live,omitempty"`
	Name     string  `json:"name,omitempty"`
	ClientID string  `json:"client_id,omitempty"`
	RoomID   string  `json:"room_id,omitempty"`
	Allowed  bool    `json:"allowed,omitempty"`
	NewToken string  `json:"new_token,omitempty"`
	MsgTitle string  `json:"title,omitempty"`
}

type CreateRoomRequest struct {
	HostName string  `json:"host_name"`
	ClientID string  `json:"client_id"`
	VideoID  string  `json:"video_id"`
	Platform string  `json:"platform"`
	Title    string  `json:"title"`
	Time     float64 `json:"current_time"`
	Paused   bool    `json:"paused"`
	IsLive   bool    `json:"is_live"`
}

type CreateRoomResponse struct {
	RoomID string `json:"room_id"`
	Token  string `json:"token"`
}

type JoinRoomRequest struct {
	Token     string `json:"token"`
	GuestName string `json:"guest_name"`
	ClientID  string `json:"client_id"`
}

type JoinRoomResponse struct {
	RoomID        string  `json:"room_id"`
	HostName      string  `json:"host_name"`
	VideoID       string  `json:"video_id"`
	Platform      string  `json:"platform"`
	Title         string  `json:"title,omitempty"`
	CurrentTime   float64 `json:"current_time"`
	Paused        bool    `json:"paused"`
	IsLive        bool    `json:"is_live"`
	HostSearching bool    `json:"host_searching"`
}

type CheckRoomResponse struct {
	Exists      bool   `json:"exists"`
	HostName    string `json:"host_name,omitempty"`
	Platform    string `json:"platform,omitempty"`
	VideoID     string `json:"video_id,omitempty"`
	Title       string `json:"title,omitempty"`
	MemberCount int    `json:"member_count,omitempty"`
}

type StatusResponse struct {
	ActiveRooms       int     `json:"active_rooms"`
	ActiveConnections int     `json:"active_connections"`
	RoomsCreatedToday int64   `json:"rooms_created_today"`
	RoomsJoinedToday  int64   `json:"rooms_joined_today"`
	UptimeSeconds     float64 `json:"uptime_seconds"`
	MemoryMB          uint64  `json:"memory_mb"`
}
