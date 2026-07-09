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
		idle := now.Sub(room.LastActivity)
		emptyExpired := !room.HostReconnecting &&
			len(room.Members) == 0 &&
			idle > time.Duration(cfg.RoomTTLMinutes)*time.Minute
		// Absolute ceiling: no heartbeat/activity at all for this long means the
		// room is stale (e.g. host switched IP/login and abandoned it without a
		// clean disconnect), so it's removed regardless of members or reconnect state.
		absoluteIdle := idle > roomMaxIdleWindow(cfg)
		shouldDelete := !room.Closed && (emptyExpired || absoluteIdle)
		if shouldDelete {
			room.Closed = true
			if room.HostReconnectTimer != nil {
				room.HostReconnectTimer.Stop()
				room.HostReconnectTimer = nil
			}
		}
		room.Unlock()

		if shouldDelete {
			globalState.DeleteRoom(roomID)
			cleaned++
			log.Debug().Str("room_id", roomID).Bool("absolute_idle", absoluteIdle).Msg("cleaned expired room")
		}
	}

	if cleaned > 0 {
		log.Info().Int("count", cleaned).Msg("cleaned expired rooms")
	}
}
