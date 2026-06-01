package main

import (
	"net/http"
	"runtime"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog/log"
)

var (
	metricActiveRooms = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "wt_active_rooms",
		Help: "Current number of active rooms",
	})
	metricActiveConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "wt_active_connections",
		Help: "Current number of active WebSocket connections",
	})
	metricRoomsCreated = promauto.NewCounter(prometheus.CounterOpts{
		Name: "wt_rooms_created_total",
		Help: "Total number of rooms created",
	})
	metricRoomsJoined = promauto.NewCounter(prometheus.CounterOpts{
		Name: "wt_rooms_joined_total",
		Help: "Total number of room joins",
	})
	metricRateLimitHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "wt_rate_limit_hits_total",
		Help: "Total number of rate limit rejections",
	})
	metricTokenFailures = promauto.NewCounter(prometheus.CounterOpts{
		Name: "wt_token_failures_total",
		Help: "Total number of token validation failures",
	})
	metricWSDisconnects = promauto.NewCounter(prometheus.CounterOpts{
		Name: "wt_ws_disconnects_total",
		Help: "Total number of WebSocket disconnections",
	})
	metricSyncActions = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "wt_sync_actions_total",
		Help: "Total sync actions by type",
	}, []string{"action"})
	metricVetoCount = promauto.NewCounter(prometheus.CounterOpts{
		Name: "wt_veto_total",
		Help: "Total number of veto actions",
	})
	metricPlatformRooms = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "wt_platform_rooms_total",
		Help: "Rooms created by platform",
	}, []string{"platform"})
	metricMemoryMB = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "wt_memory_mb",
		Help: "Current memory usage in MB",
	})
)

// UpdateGauges 定期调用，更新实时指标
func UpdateGauges() {
	metricActiveRooms.Set(float64(globalState.RoomCount()))
	metricActiveConnections.Set(float64(globalState.ConnectionCount()))

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	metricMemoryMB.Set(float64(mem.Alloc) / 1024 / 1024)
}

// StartMetricsServer 启动 Prometheus metrics 端点
func StartMetricsServer(port string) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	log.Info().Str("port", port).Msg("metrics server starting")
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Error().Err(err).Msg("metrics server failed")
	}
}
