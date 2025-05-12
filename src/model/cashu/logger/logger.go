package logger

import (
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

var (
	// DebugMode controls global logging level
	DebugMode = false
)

// Initialize sets up the global logger based on debug mode
func Initialize(debugMode bool) {
	DebugMode = debugMode

	// Set log level based on debug mode
	if DebugMode {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	} else {
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}

	// Configure console writer for browser environment
	consoleWriter := zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: "15:04:05",
		NoColor:    false,
	}

	// Replace global logger
	log.Logger = zerolog.New(consoleWriter).
		With().
		Timestamp().
		Caller().
		Logger()

	log.Info().Bool("debug_mode", DebugMode).Msg("Logger initialized")
}

// WithComponent creates a contextualized logger for a specific component
func WithComponent(component string) zerolog.Logger {
	return log.With().Str("component", component).Logger()
}
