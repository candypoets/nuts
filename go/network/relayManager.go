package network

import (
	"context"
	"sync"
	"time"

	"github.com/candypoets/nutscash/logger"
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

// RelayConnection represents a connection to a relay
type RelayConnection struct {
	Relay       *nostr.Relay
	URL         string
	Status      RelayConnectionStatus
	LastUsed    time.Time
	ErrorCount  int
	Subscribers int
	// Channel that will receive the relay once connection completes
	// nil if not currently connecting
	ConnectChan chan *nostr.Relay
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
	// First, check if we already have a connected relay
	rcm.connectionsMutex.RLock()
	conn, exists := rcm.connections[url]

	if exists && conn.Status == RelayStatusConnected && conn.Relay != nil {
		// Update last used timestamp and return existing connection
		conn.LastUsed = time.Now()
		conn.Subscribers++
		rcm.connectionsMutex.RUnlock()
		return conn.Relay, nil
	}

	// If we're already connecting, just wait for that connection
	if exists && conn.Status == RelayStatusConnecting && conn.ConnectChan != nil {
		connectChan := conn.ConnectChan
		rcm.connectionsMutex.RUnlock()

		// Wait for connection to complete or timeout
		select {
		case relay := <-connectChan:
			if relay == nil {
				return nil, ErrConnectionFailed
			}

			// Update usage info
			rcm.connectionsMutex.Lock()
			conn.Subscribers++
			conn.LastUsed = time.Now()
			rcm.connectionsMutex.Unlock()

			return relay, nil
		case <-time.After(rcm.connectTimeout):
			return nil, ErrConnectionTimeout
		}
	}

	// Need to create a new connection
	rcm.connectionsMutex.RUnlock()
	rcm.connectionsMutex.Lock()

	// Double check now that we have the write lock
	conn, exists = rcm.connections[url]
	if exists && conn.Status == RelayStatusConnected && conn.Relay != nil {
		conn.Subscribers++
		conn.LastUsed = time.Now()
		rcm.connectionsMutex.Unlock()
		return conn.Relay, nil
	}

	// If currently connecting, create a listener on the connect channel
	if exists && conn.Status == RelayStatusConnecting && conn.ConnectChan != nil {
		connectChan := conn.ConnectChan
		rcm.connectionsMutex.Unlock()

		// Wait for connection to complete or timeout
		select {
		case relay := <-connectChan:
			if relay == nil {
				return nil, ErrConnectionFailed
			}

			rcm.connectionsMutex.Lock()
			conn.Subscribers++
			conn.LastUsed = time.Now()
			rcm.connectionsMutex.Unlock()

			return relay, nil
		case <-time.After(rcm.connectTimeout):
			return nil, ErrConnectionTimeout
		}
	}

	// Create a new connection process
	connectChan := make(chan *nostr.Relay, 1)

	// Initialize or update connection record
	if !exists {
		conn = &RelayConnection{
			URL:         url,
			Status:      RelayStatusConnecting,
			LastUsed:    time.Now(),
			ConnectChan: connectChan,
			Subscribers: 1,
		}
		rcm.connections[url] = conn
	} else {
		conn.Status = RelayStatusConnecting
		conn.ConnectChan = connectChan
		conn.LastUsed = time.Now()
		conn.Subscribers = 1
	}

	rcm.log.Debug().Str("relay", url).Msg("Starting connection attempt")
	rcm.connectionsMutex.Unlock()

	// Start connection attempt in background
	go rcm.connectToRelay(url, connectChan)

	// Wait for connection to complete or timeout
	select {
	case relay := <-connectChan:
		if relay == nil {
			return nil, ErrConnectionFailed
		}
		return relay, nil
	case <-time.After(rcm.connectTimeout):
		return nil, ErrConnectionTimeout
	}
}

// connectToRelay attempts to connect to a relay and updates the connection status
func (rcm *RelayConnectionManager) connectToRelay(url string, connectChan chan *nostr.Relay) {
	// Create a context with timeout for the connection
	ctx, cancel := context.WithTimeout(context.Background(), rcm.connectTimeout)
	defer cancel()

	// Try to connect with timeout
	relay, err := nostr.RelayConnect(ctx, url)

	rcm.connectionsMutex.Lock()
	defer rcm.connectionsMutex.Unlock()

	conn, exists := rcm.connections[url]
	if !exists {
		// Connection was removed while we were connecting
		if relay != nil {
			relay.Close()
		}
		close(connectChan)
		return
	}

	// Update connection status based on result
	if err != nil {
		conn.Status = RelayStatusFailed
		conn.ErrorCount++
		rcm.log.Error().Err(err).Str("relay", url).Msg("Failed to connect to relay")
		connectChan <- nil
	} else {
		conn.Status = RelayStatusConnected
		conn.Relay = relay
		conn.ErrorCount = 0
		rcm.log.Info().Str("relay", url).Msg("Successfully connected to relay")
		connectChan <- relay
	}

	// Close the channel after sending the result
	close(conn.ConnectChan)
	conn.ConnectChan = nil
}

// ReleaseRelay decrements the subscriber count and potentially closes the connection
func (rcm *RelayConnectionManager) ReleaseRelay(url string) {
	rcm.connectionsMutex.Lock()
	defer rcm.connectionsMutex.Unlock()

	conn, exists := rcm.connections[url]
	if !exists || conn.Relay == nil {
		return
	}

	conn.Subscribers--

	// If no more subscribers, mark for potential cleanup
	if conn.Subscribers <= 0 {
		conn.Subscribers = 0
		// We don't close immediately to allow reuse
		// Cleanup will happen in CleanupIdleConnections
	}
}

// CleanupIdleConnections closes connections that haven't been used recently
func (rcm *RelayConnectionManager) CleanupIdleConnections(idleTimeout time.Duration) {
	rcm.connectionsMutex.Lock()
	defer rcm.connectionsMutex.Unlock()

	now := time.Now()
	for url, conn := range rcm.connections {
		// Close connections that are idle and have no subscribers
		if conn.Status == RelayStatusConnected &&
			conn.Subscribers <= 0 &&
			now.Sub(conn.LastUsed) > idleTimeout {
			rcm.log.Debug().Str("relay", url).Msg("Closing idle connection")
			if conn.Relay != nil {
				conn.Relay.Close()
			}
			delete(rcm.connections, url)
		}
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
	ErrConnectionFailed  = &connectionError{"relay connection failed"}
	ErrConnectionTimeout = &connectionError{"relay connection timed out"}
)

type connectionError struct {
	msg string
}

func (e *connectionError) Error() string {
	return e.msg
}
