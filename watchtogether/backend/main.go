package main

import (
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
)

func main() {
	cfg := LoadConfig()
	InitLogger()

	log.Info().Str("port", cfg.Port).Str("prom_port", cfg.PromPort).Msg("WatchTogether starting")

	go StartMetricsServer(cfg.PromPort)
	StartCleanup(cfg)

	mux := http.NewServeMux()

	mux.HandleFunc("/room/create",        CORSMiddleware(handleCreateRoom(cfg)))
	mux.HandleFunc("/room/join",          CORSMiddleware(handleJoinRoom(cfg)))
	mux.HandleFunc("/room/status",        CORSMiddleware(handleStatus()))
	mux.HandleFunc("/room/check",         CORSMiddleware(handleCheckRoom()))
	mux.HandleFunc("/room/token/refresh", CORSMiddleware(handleRefreshToken(cfg)))
	mux.HandleFunc("/ws", handleWS(cfg))
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Info().Str("addr", srv.Addr).Msg("server listening")
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal().Err(err).Msg("server failed")
	}
}
