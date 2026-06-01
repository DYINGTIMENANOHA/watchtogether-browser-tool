package main

import (
	"time"

	"github.com/rs/zerolog/log"
)

// StartCleanup 启动后台清理任务
func StartCleanup(cfg Config) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			cleanExpiredRooms(cfg)
			UpdateGauges()
		}
	}()

	// 每天凌晨重置统计计数
	go func() {
		for {
			now := time.Now()
			next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
			time.Sleep(time.Until(next))
			globalState.roomsCreatedToday.Store(0)
			globalState.roomsJoinedToday.Store(0)
			log.Info().Msg("daily stats reset")
		}
	}()
}

func cleanExpiredRooms(cfg Config) {
	rooms := globalState.AllRooms()
	now := time.Now()
	cleaned := 0

	for _, room := range rooms {
		room.RLock()
		lastActivity := room.LastActivity
		memberCount := len(room.Members)
		roomID := room.RoomID
		room.RUnlock()

		// 无成员且超过 TTL 的空房间
		if memberCount == 0 && now.Sub(lastActivity) > time.Duration(cfg.RoomTTLMinutes)*time.Minute {
			globalState.DeleteRoom(roomID)
			cleaned++
			log.Debug().Str("room_id", roomID).Msg("cleaned empty expired room")
		}
	}

	if cleaned > 0 {
		log.Info().Int("count", cleaned).Msg("cleaned expired rooms")
	}
}
