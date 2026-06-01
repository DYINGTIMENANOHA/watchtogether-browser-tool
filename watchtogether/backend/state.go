package main

import (
	"sync"
	"sync/atomic"
	"time"
)

type State struct {
	rooms   map[string]*Room
	tokens  map[string]string // token → room_id
	mu      sync.RWMutex

	// IP 相关计数
	ipRateLimit  map[string]*ipCounter  // IP → 创建房间计数
	ipTokenFail  map[string]*ipBanInfo  // IP → token 失败计数
	ipWSCount    map[string]int         // IP → 当前WS连接数
	ipMu         sync.Mutex

	// 统计计数（原子操作）
	roomsCreatedToday atomic.Int64
	roomsJoinedToday  atomic.Int64
	startTime         time.Time
}

type ipCounter struct {
	count     int
	windowEnd time.Time
}

type ipBanInfo struct {
	failCount int
	banUntil  time.Time
}

var globalState = &State{
	rooms:        make(map[string]*Room),
	tokens:       make(map[string]string),
	ipRateLimit:  make(map[string]*ipCounter),
	ipTokenFail:  make(map[string]*ipBanInfo),
	ipWSCount:    make(map[string]int),
	startTime:    time.Now(),
}

// AddRoom 添加房间
func (s *State) AddRoom(room *Room) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rooms[room.RoomID] = room
	s.tokens[room.Token] = room.RoomID
}

// GetRoom 通过 room_id 获取房间
func (s *State) GetRoom(roomID string) (*Room, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.rooms[roomID]
	return r, ok
}

// GetRoomByToken 通过 token 获取房间
func (s *State) GetRoomByToken(token string) (*Room, bool) {
	s.mu.RLock()
	roomID, ok := s.tokens[token]
	s.mu.RUnlock()
	if !ok {
		return nil, false
	}
	return s.GetRoom(roomID)
}

// DeleteRoom 删除房间
func (s *State) DeleteRoom(roomID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if room, ok := s.rooms[roomID]; ok {
		delete(s.tokens, room.Token)
		delete(s.rooms, roomID)
	}
}

// RoomCount 当前房间数
func (s *State) RoomCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.rooms)
}

// ConnectionCount 当前总连接数
func (s *State) ConnectionCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	total := 0
	for _, r := range s.rooms {
		r.RLock()
		total += len(r.Members)
		r.RUnlock()
	}
	return total
}

// CheckRateLimit 检查 IP 创建房间频率，返回是否允许
func (s *State) CheckRateLimit(ip string, limitPerMin int) bool {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	now := time.Now()
	c, ok := s.ipRateLimit[ip]
	if !ok || now.After(c.windowEnd) {
		s.ipRateLimit[ip] = &ipCounter{count: 1, windowEnd: now.Add(time.Minute)}
		return true
	}
	if c.count >= limitPerMin {
		return false
	}
	c.count++
	return true
}

// CheckTokenBan 检查 IP 是否被封禁，记录失败
func (s *State) CheckTokenBan(ip string, maxFail, banMinutes int) bool {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	now := time.Now()
	info, ok := s.ipTokenFail[ip]
	if !ok {
		return true
	}
	if now.Before(info.banUntil) {
		return false
	}
	if info.failCount >= maxFail {
		return false
	}
	return true
}

// RecordTokenFail 记录 token 验证失败
func (s *State) RecordTokenFail(ip string, maxFail, banMinutes int) {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	info, ok := s.ipTokenFail[ip]
	if !ok {
		info = &ipBanInfo{}
		s.ipTokenFail[ip] = info
	}
	info.failCount++
	if info.failCount >= maxFail {
		info.banUntil = time.Now().Add(time.Duration(banMinutes) * time.Minute)
	}
}

// RecordTokenSuccess 清除 token 失败记录
func (s *State) RecordTokenSuccess(ip string) {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	delete(s.ipTokenFail, ip)
}

// IncrWSCount 增加 IP 的 WS 连接数，返回是否允许
func (s *State) IncrWSCount(ip string, max int) bool {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	if s.ipWSCount[ip] >= max {
		return false
	}
	s.ipWSCount[ip]++
	return true
}

// DecrWSCount 减少 IP 的 WS 连接数
func (s *State) DecrWSCount(ip string) {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	if s.ipWSCount[ip] > 0 {
		s.ipWSCount[ip]--
	}
}

// AllRooms 返回所有房间快照（用于清理）
func (s *State) AllRooms() []*Room {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Room, 0, len(s.rooms))
	for _, r := range s.rooms {
		result = append(result, r)
	}
	return result
}
