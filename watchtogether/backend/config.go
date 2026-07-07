package main

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port             string
	BindHost         string
	MaxRooms         int
	MaxRoomMembers   int
	RoomTTLMinutes   int
	TokenFailMax     int
	TokenBanMinutes  int
	RateLimitPerMin  int
	WSMaxPerIP       int
	WSMsgPerSec      int
	HeartbeatTimeout int
	PromPort         string
	AllowedOrigins   []string
	ClientToken      string
}

func LoadConfig() Config {
	return Config{
		Port:             getEnv("PORT", "8892"),
		BindHost:         getEnv("BIND_HOST", ""),
		MaxRooms:         getEnvInt("MAX_ROOMS", 10000),
		MaxRoomMembers:   getEnvInt("MAX_ROOM_MEMBERS", 25),
		RoomTTLMinutes:   getEnvInt("ROOM_TTL_MINUTES", 60),
		TokenFailMax:     getEnvInt("TOKEN_FAIL_MAX", 10),
		TokenBanMinutes:  getEnvInt("TOKEN_BAN_MINUTES", 5),
		RateLimitPerMin:  getEnvInt("RATE_LIMIT_PER_MIN", 5),
		WSMaxPerIP:       getEnvInt("WS_MAX_PER_IP", 20),
		WSMsgPerSec:      getEnvInt("WS_MSG_PER_SEC", 10),
		HeartbeatTimeout: getEnvInt("HEARTBEAT_TIMEOUT", 120),
		PromPort:         getEnv("PROM_PORT", "9091"),
		AllowedOrigins:   getEnvList("ALLOWED_ORIGINS"),
		ClientToken:      getEnv("CLIENT_TOKEN", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getEnvList(key string) []string {
	raw := os.Getenv(key)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			values = append(values, p)
		}
	}
	return values
}
