package main

import (
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// rotatingWriter 实现按大小轮转的日志写入器，无需外部依赖
type rotatingWriter struct {
	mu       sync.Mutex
	file     *os.File
	path     string
	maxBytes int64
	maxFiles int
}

func newRotatingWriter(path string, maxMB int, maxFiles int) (*rotatingWriter, error) {
	w := &rotatingWriter{
		path:     path,
		maxBytes: int64(maxMB) * 1024 * 1024,
		maxFiles: maxFiles,
	}
	if err := w.openFile(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *rotatingWriter) openFile() error {
	f, err := os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	w.file = f
	return nil
}

func (w *rotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	n, err := w.file.Write(p)
	if err == nil {
		if info, serr := w.file.Stat(); serr == nil && info.Size() >= w.maxBytes {
			w.rotate()
		}
	}
	return n, err
}

func (w *rotatingWriter) rotate() {
	w.file.Close()
	// 移动旧文件：.3→删除, .2→.3, .1→.2, 当前→.1
	for i := w.maxFiles - 1; i >= 1; i-- {
		old := fmt.Sprintf("%s.%d", w.path, i)
		newName := fmt.Sprintf("%s.%d", w.path, i+1)
		os.Rename(old, newName)
	}
	os.Remove(fmt.Sprintf("%s.%d", w.path, w.maxFiles))
	os.Rename(w.path, w.path+".1")
	w.openFile()
}

func InitLogger() {
	logDir := "logs"
	_ = os.MkdirAll(logDir, 0755)

	zerolog.TimeFieldFormat = time.RFC3339

	var writers []io.Writer

	// 文件输出：JSON 格式，按大小轮转（单文件 ≤100MB，保留最近 3 个文件）
	rw, err := newRotatingWriter(logDir+"/watchtogether.log", 100, 3)
	if err == nil {
		writers = append(writers, rw)
	}

	// 控制台输出
	if os.Getenv("LOG_PRETTY") == "1" {
		writers = append(writers, zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339})
	} else {
		writers = append(writers, os.Stdout)
	}

	multi := zerolog.MultiLevelWriter(writers...)
	log.Logger = zerolog.New(multi).With().Timestamp().Logger()

	zerolog.SetGlobalLevel(zerolog.InfoLevel)
	if os.Getenv("LOG_DEBUG") == "1" {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}

	log.Info().Msg("logger initialized")
}
