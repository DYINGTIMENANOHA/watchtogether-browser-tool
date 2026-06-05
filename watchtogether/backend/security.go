package main

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
)

func GetIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ips := r.Header.Get("X-Forwarded-For"); ips != "" {
		parts := strings.Split(ips, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	return ip
}

func CORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return CORSMiddlewareWithConfig(Config{}, next)
}

func CORSMiddlewareWithConfig(cfg Config, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isOriginAllowed(cfg, origin) {
			if origin != "" && len(cfg.AllowedOrigins) > 0 {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-WT-Client-Token")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			if !isOriginAllowed(cfg, origin) {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if !isOriginAllowed(cfg, origin) {
			http.Error(w, `{"error":"origin not allowed"}`, http.StatusForbidden)
			return
		}
		if !hasValidClientToken(cfg, r) {
			http.Error(w, `{"error":"invalid client token"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func isOriginAllowed(cfg Config, origin string) bool {
	if len(cfg.AllowedOrigins) == 0 {
		return true
	}
	for _, allowed := range cfg.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func hasValidClientToken(cfg Config, r *http.Request) bool {
	if cfg.ClientToken == "" {
		return true
	}
	token := r.Header.Get("X-WT-Client-Token")
	if token == "" {
		token = r.URL.Query().Get("client_token")
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(cfg.ClientToken)) == 1
}
