package main

import (
	"time"

	"github.com/rs/zerolog/log"
)

func StartCleanup(cfg Config) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			cleanExpiredRooms(cfg)
			UpdateGauges()
		}
	}()

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
		room.Lock()
		roomID := room.RoomID
		shouldDelete := !room.Closed &&
			!room.HostReconnecting &&
			len(room.Members) == 0 &&
			now.Sub(room.LastActivity) > time.Duration(cfg.RoomTTLMinutes)*time.Minute
		if shouldDelete {
			room.Closed = true
		}
		room.Unlock()

		if shouldDelete {
			globalState.DeleteRoom(roomID)
			cleaned++
			log.Debug().Str("room_id", roomID).Msg("cleaned empty expired room")
		}
	}

	if cleaned > 0 {
		log.Info().Int("count", cleaned).Msg("cleaned expired rooms")
	}
}
