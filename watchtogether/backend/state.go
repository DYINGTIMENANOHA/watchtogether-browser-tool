package main

import (
	"sync"
	"sync/atomic"
	"time"
)

type State struct {
	rooms  map[string]*Room
	tokens map[string]string
	mu     sync.RWMutex

	ipRateLimit map[string]*ipCounter
	ipTokenFail map[string]*ipBanInfo
	ipWSCount   map[string]int
	ipMu        sync.Mutex

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
	rooms:       make(map[string]*Room),
	tokens:      make(map[string]string),
	ipRateLimit: make(map[string]*ipCounter),
	ipTokenFail: make(map[string]*ipBanInfo),
	ipWSCount:   make(map[string]int),
	startTime:   time.Now(),
}

func (s *State) AddRoom(room *Room) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rooms[room.RoomID] = room
	s.tokens[room.Token] = room.RoomID
}

func (s *State) GetRoom(roomID string) (*Room, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.rooms[roomID]
	return r, ok
}

func (s *State) GetRoomByToken(token string) (*Room, bool) {
	s.mu.RLock()
	roomID, ok := s.tokens[token]
	s.mu.RUnlock()
	if !ok {
		return nil, false
	}
	return s.GetRoom(roomID)
}

func (s *State) DeleteRoom(roomID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if room, ok := s.rooms[roomID]; ok {
		delete(s.tokens, room.Token)
		delete(s.rooms, roomID)
	}
}

func (s *State) RoomCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.rooms)
}

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
	if !info.banUntil.IsZero() {
		delete(s.ipTokenFail, ip)
		return true
	}
	if info.failCount >= maxFail {
		return false
	}
	return true
}

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

func (s *State) RecordTokenSuccess(ip string) {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	delete(s.ipTokenFail, ip)
}

func (s *State) IncrWSCount(ip string, max int) bool {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	if s.ipWSCount[ip] >= max {
		return false
	}
	s.ipWSCount[ip]++
	return true
}

func (s *State) DecrWSCount(ip string) {
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	if s.ipWSCount[ip] > 0 {
		s.ipWSCount[ip]--
	}
}

func (s *State) AllRooms() []*Room {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Room, 0, len(s.rooms))
	for _, r := range s.rooms {
		result = append(result, r)
	}
	return result
}
