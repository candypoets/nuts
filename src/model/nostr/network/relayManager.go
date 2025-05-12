package network

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/candypoets/nutscash/nostr/logger"
	"github.com/nbd-wtf/go-nostr"
	"github.com/rs/zerolog"
)

// RelayConnectionStatus represents the status of a relay connection
type RelayConnectionStatus int

const (
	RelayStatusDisconnected RelayConnectionStatus = iota
	RelayStatusConnecting
	RelayStatusConnected
	RelayStatusFailed
)

// String makes RelayConnectionStatus implement fmt.Stringer for easier logging
func (s RelayConnectionStatus) String() string {
	switch s {
	case RelayStatusDisconnected:
		return "Disconnected"
	case RelayStatusConnecting:
		return "Connecting"
	case RelayStatusConnected:
		return "Connected"
	case RelayStatusFailed:
		return "Failed"
	default:
		// Use fmt.Sprintf to avoid direct dependency if Stringer is the only use
		return fmt.Sprintf("UnknownStatus(%d)", int(s))
	}
}

// RelayConnection represents a connection to a relay
type RelayConnection struct {
	Relay       *nostr.Relay
	URL         string
	Status      RelayConnectionStatus
	LastUsed    time.Time
	ErrorCount  int
	Subscribers int
	cond        *sync.Cond
	lastError   error
}

// RelayConnectionManager manages connections to Nostr relays
type RelayConnectionManager struct {
	connections      map[string]*RelayConnection
	connectionsMutex sync.RWMutex
	connectTimeout   time.Duration
	log              zerolog.Logger
	maxRetries       int
}

// NewRelayConnectionManager creates a new relay connection manager
func NewRelayConnectionManager(connectTimeout time.Duration, maxRetries int) *RelayConnectionManager {
	return &RelayConnectionManager{
		connections:    make(map[string]*RelayConnection),
		connectTimeout: connectTimeout,
		maxRetries:     maxRetries,
		log:            logger.WithComponent("relay_manager"),
	}
}

// GetRelay returns an existing connection or initiates a new one
func (rcm *RelayConnectionManager) GetRelay(url string) (*nostr.Relay, error) {
	url = nostr.NormalizeURL(url)
	rcm.log.Debug().Str("relay", url).Msg("GetRelay called, acquiring lock")

	rcm.connectionsMutex.Lock() // Acquire write lock immediately

	conn, exists := rcm.connections[url]

	// --- Case 1: Connection exists and is already connected ---
	if exists && conn.Status == RelayStatusConnected && conn.Relay != nil {
		rcm.log.Debug().Str("relay", url).Msg("Using existing connected relay")
		conn.LastUsed = time.Now()
		conn.Subscribers++
		rcm.connectionsMutex.Unlock()
		return conn.Relay, nil

	}

	// --- Case 2: Connection exists and is currently connecting ---
	if exists && conn.Status == RelayStatusConnecting {
		rcm.log.Debug().Str("relay", url).Msg("Connection in progress, waiting...")
		// Ensure cond is initialized (should have been by the initiator)
		if conn.cond == nil {
			// This shouldn't happen if the initiating goroutine sets it, but handle defensively
			rcm.log.Warn().Str("relay", url).Msg("Condition variable was nil while connecting, initializing")
			conn.cond = sync.NewCond(&rcm.connectionsMutex)
		}

		// Wait until the status is no longer 'Connecting'
		for conn.Status == RelayStatusConnecting {
			conn.cond.Wait() // Atomically unlocks Mutex, waits, and re-locks upon waking
		}
		rcm.log.Debug().Str("relay", url).Msg("Woke up from waiting")

		// After waking up, check the final status
		if conn.Status == RelayStatusConnected && conn.Relay != nil {
			rcm.log.Debug().Str("relay", url).Msg("Connection successful after waiting")
			conn.LastUsed = time.Now()
			conn.Subscribers++ // Increment subscriber count for this waiter
			rcm.connectionsMutex.Unlock()
			return conn.Relay, nil
		} else {
			// Connection failed while we were waiting
			rcm.log.Debug().Str("relay", url).Msg("Connection failed after waiting")
			err := conn.lastError // Use the stored error
			if err == nil {
				err = ErrConnectionFailed // Fallback error
			}
			rcm.connectionsMutex.Unlock()
			return nil, err
		}
	}

	// --- Case 3: No connection exists, or it exists but failed/disconnected ---
	// Need to initiate a new connection attempt.
	rcm.log.Debug().Str("relay", url).Msg("Initiating new connection attempt")

	// Initialize or reset the connection entry
	if !exists {
		conn = &RelayConnection{
			URL:    url,
			Status: RelayStatusConnecting,               // Set status before releasing lock/starting goroutine
			cond:   sync.NewCond(&rcm.connectionsMutex), // Initialize cond
		}
		rcm.connections[url] = conn
	} else { // exists but is Failed or Disconnected
		conn.Status = RelayStatusConnecting
		conn.ErrorCount = 0 // Reset error count for new attempt
		conn.lastError = nil
		conn.Relay = nil // Ensure old relay object is cleared
		if conn.cond == nil {
			conn.cond = sync.NewCond(&rcm.connectionsMutex) // Initialize cond if needed
		}
	}

	// Set initial state before starting the connection goroutine
	conn.LastUsed = time.Now()
	conn.Subscribers = 1 // This call is the first subscriber

	// Start connection attempt in background
	// Pass the connection object itself or just the URL; URL is simpler.
	go rcm.ConnectToRelay(url)

	rcm.log.Debug().Str("relay", url).Msg("Started connection goroutine, now waiting for result...")

	// Wait for the connection goroutine we just started
	for conn.Status == RelayStatusConnecting {
		conn.cond.Wait()
	}
	rcm.log.Debug().Str("relay", url).Msg("Woke up after initiating connection")

	// Check the final status set by connectToRelay
	if conn.Status == RelayStatusConnected && conn.Relay != nil {
		rcm.log.Debug().Str("relay", url).Msg("Connection successful after initiating")
		// Subscribers and LastUsed already set
		rcm.connectionsMutex.Unlock()
		return conn.Relay, nil
	} else {
		// Connection failed
		rcm.log.Debug().Str("relay", url).Msg("Connection failed after initiating")
		err := conn.lastError
		if err == nil {
			err = ErrConnectionFailed // Fallback error
		}
		// Clean up the failed connection entry immediately? Or leave it as Failed?
		// Leaving it allows checking ErrorCount later. Let's leave it.
		// delete(rcm.connections, url) // Option: Remove immediately on first failure
		rcm.connectionsMutex.Unlock()
		return nil, err
	}
}

// ConnectToRelay attempts to connect to a relay and updates the connection status
func (rcm *RelayConnectionManager) ConnectToRelay(url string) {
	rcm.log.Debug().Str("relay", url).Msg("Starting connectToRelay goroutine")

	// Create a context with timeout for the connection attempt
	ctx, cancel := context.WithTimeout(context.Background(), rcm.connectTimeout)
	defer cancel()

	// Try to connect
	relay, err := nostr.RelayConnect(ctx, url)

	// --- Update shared state under lock ---
	rcm.connectionsMutex.Lock()
	defer rcm.connectionsMutex.Unlock() // Ensure unlock happens

	// Retrieve the connection entry again (it must exist)
	conn, exists := rcm.connections[url]
	if !exists {
		// This is unexpected if GetRelay added it before starting the goroutine
		rcm.log.Error().Str("relay", url).Msg("Connection entry disappeared during connection attempt!")
		if relay != nil {
			relay.Close() // Close the potentially successful connection
		}
		// Cannot signal cond if conn is gone.
		return
	}

	// Only proceed if the status is still Connecting (avoid race conditions if connection was cancelled/retried)
	if conn.Status != RelayStatusConnecting {
		rcm.log.Warn().Str("relay", url).Int("current_status", int(conn.Status)).Msg("Connection status changed unexpectedly during connect attempt, aborting update")
		if relay != nil {
			relay.Close()
		}
		// Do not signal here, as another process likely took over.
		return
	}

	// Update connection status based on result
	if err != nil {
		conn.Status = RelayStatusFailed
		conn.ErrorCount++
		conn.lastError = err // Store the specific error
		conn.Relay = nil     // Ensure relay is nil on failure
		rcm.log.Error().Err(err).Str("relay", url).Msg("Failed to connect to relay")
	} else {
		conn.Status = RelayStatusConnected
		conn.Relay = relay
		conn.ErrorCount = 0
		conn.lastError = nil
		rcm.log.Info().Str("relay", url).Msg("Successfully connected to relay")
	}

	// Signal all waiting goroutines (if any)
	if conn.cond != nil {
		rcm.log.Debug().Str("relay", url).Msg("Broadcasting connection result")
		conn.cond.Broadcast()
	} else {
		// Should not happen if GetRelay initialized it
		rcm.log.Warn().Str("relay", url).Msg("Condition variable was nil when trying to broadcast result")
	}
}

// MarkRelayAsClosed explicitly sets a relay's status to Disconnected.
// This is typically called when an external event (e.g., relay server closes WebSocket,
// or a read/write error on the connection) indicates the connection is lost.
// It signals any goroutines waiting in GetRelay for this connection that the
// current connection attempt (if any) has effectively failed or the existing connection is gone.
// Subsequent GetRelay calls for this URL will attempt to reconnect.
func (rcm *RelayConnectionManager) MarkRelayAsClosed(url string, reason error) {
	url = nostr.NormalizeURL(url)
	rcm.log.Debug().Str("relay", url).Err(reason).Msg("MarkRelayAsClosed: Called")

	rcm.connectionsMutex.Lock()
	defer rcm.connectionsMutex.Unlock()

	conn, exists := rcm.connections[url]
	if !exists {
		rcm.log.Warn().Str("relay", url).Msg("MarkRelayAsClosed: Attempted to mark non-existent relay connection as closed")
		return
	}

	// If the connection is already in a terminal non-connected state (Failed or Disconnected),
	// we might just update the error if a new one is provided. No major state change or broadcast needed
	// unless it was stuck in Connecting.
	if conn.Status == RelayStatusFailed || conn.Status == RelayStatusDisconnected {
		rcm.log.Debug().Str("relay", url).Str("current_status", conn.Status.String()).Msg("MarkRelayAsClosed: Relay already in a terminal non-connected state. Updating error if provided.")
		if reason != nil {
			conn.lastError = reason // Update error if a new, potentially more specific, one is provided
		}
		// conn.LastUsed = time.Now() // Optionally update LastUsed to reflect this "event"
		return
	}

	rcm.log.Info().Str("relay", url).Err(reason).Str("previous_status", conn.Status.String()).Msg("MarkRelayAsClosed: Marking relay as Disconnected")

	// Close the underlying nostr.Relay object if it exists
	if conn.Relay != nil {
		// nostr.Relay.Close() should be safe to call multiple times / on an already closing connection
		errClose := conn.Relay.Close()
		if errClose != nil {
			// Log error during close but proceed with marking as disconnected
			rcm.log.Warn().Str("relay", url).Err(errClose).Msg("MarkRelayAsClosed: Error closing underlying relay connection")
		}
		conn.Relay = nil
	}

	conn.Status = RelayStatusDisconnected
	conn.ErrorCount++ // Increment error count, as this is an unexpected failure/closure.
	// GetRelay resets this when it initiates a fresh connection attempt.
	if reason != nil {
		conn.lastError = reason
	} else {
		conn.lastError = ErrRelayClosedExternally // Use a default error if no specific reason is given
	}
	conn.LastUsed = time.Now() // Update LastUsed to reflect this event and potentially affect idle cleanup timing.

	// Signal any goroutines that might be waiting in GetRelay (i.e., in conn.cond.Wait()).
	// This is crucial if conn.Status was RelayStatusConnecting when this method was called.
	// If it was RelayStatusConnected, no goroutines *should* be waiting on this cond for *this* connection
	// to establish, but broadcasting is harmless and covers edge cases.
	if conn.cond != nil {
		rcm.log.Debug().Str("relay", url).Msg("MarkRelayAsClosed: Broadcasting connection closure signal to waiters")
		conn.cond.Broadcast()
	} else {
		// This is unexpected for an existing connection entry created by GetRelay.
		rcm.log.Error().Str("relay", url).Msg("MarkRelayAsClosed: Condition variable was nil. This might indicate a bug in connection entry initialization.")
	}
}

// ReleaseRelay decrements the subscriber count and potentially closes the connection
func (rcm *RelayConnectionManager) ReleaseRelay(url string) {
	url = nostr.NormalizeURL(url)
	rcm.connectionsMutex.Lock()
	defer rcm.connectionsMutex.Unlock()

	conn, exists := rcm.connections[url]
	// Only decrement if connected and exists
	if !exists || conn.Status != RelayStatusConnected {
		return
	}

	conn.Subscribers--
	rcm.log.Debug().Str("relay", url).Int("subscribers", conn.Subscribers).Msg("Released relay")

	if conn.Subscribers < 0 {
		rcm.log.Warn().Str("relay", url).Int("subscribers", conn.Subscribers).Msg("Subscriber count went negative")
		conn.Subscribers = 0
	}

	// No immediate closing, CleanupIdleConnections handles that
}

// CleanupIdleConnections closes connections that haven't been used recently
func (rcm *RelayConnectionManager) CleanupIdleConnections(idleTimeout time.Duration) {
	rcm.connectionsMutex.Lock()
	defer rcm.connectionsMutex.Unlock()

	now := time.Now()
	rcm.log.Debug().Msg("Running idle connection cleanup")
	cleanedCount := 0
	for url, conn := range rcm.connections {
		// Close connections that are idle (Connected or Failed) and have no subscribers
		// We also clean up Failed connections eventually if they have no subscribers
		isIdle := now.Sub(conn.LastUsed) > idleTimeout
		canCleanup := conn.Subscribers <= 0 && (conn.Status == RelayStatusConnected || conn.Status == RelayStatusFailed)

		if isIdle && canCleanup {
			rcm.log.Info().Str("relay", url).Dur("idle_duration", now.Sub(conn.LastUsed)).Msg("Closing idle/unused connection")
			if conn.Relay != nil {
				conn.Relay.Close() // Safe to call Close multiple times or on nil
			}
			delete(rcm.connections, url)
			cleanedCount++
		} else if conn.Status == RelayStatusConnecting && now.Sub(conn.LastUsed) > idleTimeout*2 {
			// Optional: Timeout stuck connections (adjust multiplier as needed)
			rcm.log.Warn().Str("relay", url).Msg("Connection stuck in connecting state for too long, marking as failed")
			conn.Status = RelayStatusFailed
			conn.lastError = ErrConnectionTimeout // Or a specific "stuck" error
			if conn.cond != nil {
				conn.cond.Broadcast() // Wake up any potential waiters
			}
			// It will be cleaned up on the next cycle if subscribers is 0
		}
	}
	if cleanedCount > 0 {
		rcm.log.Debug().Int("cleaned_count", cleanedCount).Msg("Idle connection cleanup finished")
	}
}

// GetConnectionCount returns the number of active connections
func (rcm *RelayConnectionManager) GetConnectionCount() int {
	rcm.connectionsMutex.RLock()
	defer rcm.connectionsMutex.RUnlock()

	count := 0
	for _, conn := range rcm.connections {
		if conn.Status == RelayStatusConnected {
			count++
		}
	}
	return count
}

// Errors
var (
	ErrConnectionFailed      = &connectionError{"relay connection failed"}
	ErrConnectionTimeout     = &connectionError{"relay connection timed out"}
	ErrRelayClosedExternally = &connectionError{"relay connection closed externally"}
)

type connectionError struct {
	msg string
}

func (e *connectionError) Error() string {
	return e.msg
}
