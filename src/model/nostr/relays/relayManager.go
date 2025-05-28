package relays

import (
	"context"
	"sync"
	"time"

	"github.com/candypoets/nutscash/nostr/logger"
	"github.com/nbd-wtf/go-nostr"
	"github.com/rs/zerolog"
)

// RelayConnectionManager manages connections to Nostr relays with Safari-optimized coordination
type RelayConnectionManager struct {
	registry       *ConnectionsRegistry
	connectTimeout time.Duration
	maxRetries     int
	log            zerolog.Logger

	// Cleanup management
	cleanupTicker *time.Ticker
	cleanupStop   chan struct{}
	cleanupOnce   sync.Once
	closed        bool
	closeMutex    sync.RWMutex
}

// NewRelayConnectionManager creates a new relay connection manager with Safari optimizations
func NewRelayConnectionManager(connectTimeout time.Duration, maxRetries int) RelayManager {
	log := logger.WithComponent("relay_manager")

	rcm := &RelayConnectionManager{
		registry:       NewConnectionsRegistry(log),
		connectTimeout: connectTimeout,
		maxRetries:     maxRetries,
		log:            log,
		cleanupStop:    make(chan struct{}),
		cleanupTicker:  time.NewTicker(2 * time.Second),
	}

	// Start cleanup routine
	go rcm.cleanupRoutine()

	return rcm
}

// GetRelay returns an existing connection or initiates a new one (blocking)
func (rcm *RelayConnectionManager) GetRelay(url string) (*nostr.Relay, error) {
	ctx, cancel := context.WithTimeout(context.Background(), rcm.connectTimeout)
	defer cancel()

	return rcm.GetRelayAsync(ctx, url)
}

// GetRelayAsync returns an existing connection or initiates a new one (with context)
func (rcm *RelayConnectionManager) GetRelayAsync(ctx context.Context, url string) (*nostr.Relay, error) {
	rcm.closeMutex.RLock()
	if rcm.closed {
		rcm.closeMutex.RUnlock()
		return nil, ErrManagerClosed
	}
	rcm.closeMutex.RUnlock()

	url = nostr.NormalizeURL(url)
	rcm.log.Debug().Str("relay", url).Msg("GetRelayAsync called")

	// Get or create connection from registry
	conn := rcm.registry.GetOrCreate(url)
	if conn == nil {
		rcm.log.Error().Str("relay", url).Msg("Registry returned nil connection")
		return nil, ErrNilRelay
	}

	// Try to connect using channel-based coordination
	relay, err := conn.TryConnect(ctx, rcm.connectTimeout)
	if err != nil {
		rcm.log.Error().Str("relay", url).Err(err).Msg("Failed to connect to relay")
		return nil, err
	}

	// Ensure relay is not nil before returning
	if relay == nil {
		rcm.log.Error().Str("relay", url).Msg("TryConnect returned nil relay without error")
		return nil, ErrNilRelay
	}

	rcm.log.Debug().Str("relay", url).Msg("Successfully got relay connection")
	return relay, nil
}

// ReleaseRelay decrements the subscriber count for a relay
func (rcm *RelayConnectionManager) ReleaseRelay(url string) {
	url = nostr.NormalizeURL(url)

	conn, exists := rcm.registry.Get(url)
	if !exists {
		return
	}

	if conn == nil {
		rcm.log.Warn().Str("relay", url).Msg("Attempting to release nil connection")
		return
	}

	conn.Release()
	rcm.log.Debug().Str("relay", url).Int("subscribers", conn.GetSubscribers()).Msg("Released relay")
}

// MarkRelayAsClosed marks a relay as disconnected due to external events
func (rcm *RelayConnectionManager) MarkRelayAsClosed(url string, reason error) {
	url = nostr.NormalizeURL(url)
	rcm.log.Debug().Str("relay", url).Err(reason).Msg("MarkRelayAsClosed called")

	conn, exists := rcm.registry.Get(url)
	if !exists {
		rcm.log.Warn().Str("relay", url).Msg("Attempted to mark non-existent relay as closed")
		return
	}

	if conn == nil {
		rcm.log.Warn().Str("relay", url).Msg("Attempted to mark nil connection as closed")
		return
	}

	conn.MarkAsClosed(reason)
	rcm.log.Info().Str("relay", url).Err(reason).Msg("Marked relay as closed")
}

// PickRandomRelay randomly selects a relay from the connected relays
func (rcm *RelayConnectionManager) PickRandomRelay() *nostr.Relay {
	connectedRelays := rcm.registry.GetConnectedRelays()

	if len(connectedRelays) == 0 {
		return nil
	}

	// Use current time as simple random seed
	randomIndex := time.Now().UnixNano() % int64(len(connectedRelays))
	selectedConn := connectedRelays[int(randomIndex)]

	if selectedConn == nil {
		rcm.log.Warn().Msg("Selected connection is nil")
		return nil
	}

	relay := selectedConn.GetRelay()
	if relay == nil {
		rcm.log.Warn().Str("relay", selectedConn.GetURL()).Msg("Connected relay returned nil")
		// Try to mark it as closed since it's not actually connected
		rcm.MarkRelayAsClosed(selectedConn.GetURL(), ErrNilRelay)
		return nil
	}

	return relay
}

// GetConnectionCount returns the number of active connections
func (rcm *RelayConnectionManager) GetConnectionCount() int {
	return len(rcm.registry.GetConnectedRelays())
}

// GetStats returns comprehensive statistics about the relay manager
func (rcm *RelayConnectionManager) GetStats() RelayManagerStats {
	return RelayManagerStats{
		Registry:          rcm.registry.GetStats(),
		ActiveConnections: rcm.GetConnectionCount(),
		LastCleanup:       time.Now(), // Could track this if needed
	}
}

// Close gracefully shuts down the relay manager
func (rcm *RelayConnectionManager) Close() {
	rcm.closeMutex.Lock()
	defer rcm.closeMutex.Unlock()

	if rcm.closed {
		return
	}

	rcm.log.Info().Msg("Closing relay connection manager")

	rcm.closed = true

	// Stop cleanup routine
	rcm.cleanupOnce.Do(func() {
		close(rcm.cleanupStop)
		rcm.cleanupTicker.Stop()
	})

	// Close all connections
	connections := rcm.registry.GetAllConnections()
	for _, conn := range connections {
		conn.Close()
	}

	rcm.log.Info().Msg("Relay connection manager closed")
}

// cleanupRoutine runs periodic cleanup of idle connections
func (rcm *RelayConnectionManager) cleanupRoutine() {
	rcm.log.Debug().Msg("Starting cleanup routine")

	for {
		select {
		case <-rcm.cleanupStop:
			rcm.log.Debug().Msg("Cleanup routine stopped")
			return

		case <-rcm.cleanupTicker.C:
			rcm.performCleanup()
		}
	}
}

// performCleanup performs the actual cleanup of idle and stuck connections
func (rcm *RelayConnectionManager) performCleanup() {
	rcm.closeMutex.RLock()
	if rcm.closed {
		rcm.closeMutex.RUnlock()
		return
	}
	rcm.closeMutex.RUnlock()

	rcm.log.Debug().Msg("Running connection cleanup")

	// Clean up idle connections
	urlsToDelete, connectionsToClose := rcm.registry.CleanupEligibleConnections(rcm.connectTimeout * 2)

	// Close connections outside any locks to prevent deadlocks
	for _, conn := range connectionsToClose {
		conn.Close()
	}

	// Remove from registry
	if len(urlsToDelete) > 0 {
		removedCount := rcm.registry.RemoveBatch(urlsToDelete)
		rcm.log.Debug().Int("removed_count", removedCount).Msg("Cleaned up idle connections")
	}

	// Handle stuck connections
	stuckConnections := rcm.registry.GetStuckConnections(rcm.connectTimeout * 3)
	for _, conn := range stuckConnections {
		conn.MarkAsStuck()
		rcm.log.Warn().Str("relay", conn.GetURL()).Msg("Marked stuck connection as failed")
	}

	if len(urlsToDelete) > 0 || len(stuckConnections) > 0 {
		stats := rcm.registry.GetStats()
		rcm.log.Debug().
			Int("total", stats.TotalConnections).
			Int("connected", stats.ConnectedCount).
			Int("connecting", stats.ConnectingCount).
			Int("failed", stats.FailedCount).
			Msg("Cleanup completed")
	}
}
