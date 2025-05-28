package relays

import (
	"context"
	"sync"
	"time"

	"github.com/nbd-wtf/go-nostr"
)



// RelayConnection represents a connection to a relay with channel-based coordination
type RelayConnection struct {
	mu          sync.RWMutex
	relay       *nostr.Relay
	url         string
	status      RelayConnectionStatus
	lastUsed    time.Time
	errorCount  int
	subscribers int
	lastError   error
	
	// Channel-based coordination for Safari compatibility
	connectionResult chan ConnectionResult
	waiters          int
	closed           bool
}



// NewRelayConnection creates a new relay connection with channel-based coordination
func NewRelayConnection(url string) *RelayConnection {
	return &RelayConnection{
		url:              url,
		status:           RelayStatusDisconnected,
		connectionResult: make(chan ConnectionResult, 1),
		waiters:          0,
		closed:           false,
	}
}

// GetStatus returns the current connection status (thread-safe)
func (rc *RelayConnection) GetStatus() RelayConnectionStatus {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	return rc.status
}

// GetRelay returns the relay connection (thread-safe)
func (rc *RelayConnection) GetRelay() *nostr.Relay {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	return rc.relay
}

// GetURL returns the relay URL
func (rc *RelayConnection) GetURL() string {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	return rc.url
}

// GetSubscribers returns the number of subscribers (thread-safe)
func (rc *RelayConnection) GetSubscribers() int {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	return rc.subscribers
}

// GetLastUsed returns the last used time (thread-safe)
func (rc *RelayConnection) GetLastUsed() time.Time {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	return rc.lastUsed
}

// GetError returns the last error (thread-safe)
func (rc *RelayConnection) GetError() error {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	return rc.lastError
}

// GetErrorCount returns the error count (thread-safe)
func (rc *RelayConnection) GetErrorCount() int {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	return rc.errorCount
}

// TryConnect attempts to acquire a connection or waits for an ongoing connection
func (rc *RelayConnection) TryConnect(ctx context.Context, connectTimeout time.Duration) (*nostr.Relay, error) {
	rc.mu.Lock()
	
	// Case 1: Already connected
	if rc.status == RelayStatusConnected && rc.relay != nil {
		rc.lastUsed = time.Now()
		rc.subscribers++
		rc.mu.Unlock()
		return rc.relay, nil
	}
	
	// Case 2: Currently connecting - join the wait
	if rc.status == RelayStatusConnecting {
		rc.waiters++
		rc.mu.Unlock()
		
		// Wait for connection result with timeout
		select {
		case result := <-rc.connectionResult:
			rc.mu.Lock()
			defer rc.mu.Unlock()
			
			if result.Error == nil && result.Relay != nil {
				rc.lastUsed = time.Now()
				rc.subscribers++
				return result.Relay, nil
			}
			// If no error but relay is nil, create an error
			if result.Error == nil && result.Relay == nil {
				return nil, ErrNilRelay
			}
			return nil, result.Error
			
		case <-ctx.Done():
			return nil, ctx.Err()
			
		case <-time.After(connectTimeout):
			return nil, ErrConnectionTimeout
		}
	}
	
	// Case 3: Need to initiate connection
	rc.status = RelayStatusConnecting
	rc.errorCount = 0
	rc.lastError = nil
	rc.relay = nil
	rc.lastUsed = time.Now()
	rc.subscribers = 1
	rc.waiters = 0
	
	// Create new channel for this connection attempt
	rc.connectionResult = make(chan ConnectionResult, 1)
	
	rc.mu.Unlock()
	
	// Start connection attempt
	go rc.connect(connectTimeout)
	
	// Wait for our own connection result
	select {
	case result := <-rc.connectionResult:
		rc.mu.Lock()
		defer rc.mu.Unlock()
		
		if result.Error == nil && result.Relay != nil {
			return result.Relay, nil
		}
		// If no error but relay is nil, create an error
		if result.Error == nil && result.Relay == nil {
			return nil, ErrNilRelay
		}
		return nil, result.Error
		
	case <-ctx.Done():
		return nil, ctx.Err()
		
	case <-time.After(connectTimeout):
		return nil, ErrConnectionTimeout
	}
}

// connect performs the actual connection attempt
func (rc *RelayConnection) connect(connectTimeout time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), connectTimeout)
	defer cancel()
	
	relay, err := nostr.RelayConnect(ctx, rc.url)
	
	// Update state and notify waiters
	rc.mu.Lock()
	defer rc.mu.Unlock()
	
	// Only update if still in connecting state
	if rc.status != RelayStatusConnecting {
		if relay != nil {
			relay.Close()
		}
		return
	}
	
	result := ConnectionResult{
		Relay: relay,
		Error: err,
	}
	
	if err != nil {
		rc.status = RelayStatusFailed
		rc.errorCount++
		rc.lastError = err
		rc.relay = nil
	} else if relay == nil {
		// Connection succeeded but relay is nil - treat as error
		rc.status = RelayStatusFailed
		rc.errorCount++
		rc.lastError = ErrNilRelay
		rc.relay = nil
		result.Error = ErrNilRelay
	} else {
		rc.status = RelayStatusConnected
		rc.relay = relay
		rc.errorCount = 0
		rc.lastError = nil
	}
	
	// Send result to channel (non-blocking)
	select {
	case rc.connectionResult <- result:
	default:
		// Channel full, close the relay if connection succeeded
		if relay != nil && err == nil {
			relay.Close()
		}
	}
}

// MarkAsClosed marks the connection as closed and updates state
func (rc *RelayConnection) MarkAsClosed(reason error) {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	
	if rc.status == RelayStatusFailed || rc.status == RelayStatusDisconnected {
		if reason != nil {
			rc.lastError = reason
		}
		return
	}
	
	// Close the relay without holding the mutex
	if rc.relay != nil {
		relay := rc.relay
		rc.relay = nil
		rc.mu.Unlock()
		relay.Close()
		rc.mu.Lock()
	}
	
	rc.status = RelayStatusDisconnected
	rc.errorCount++
	if reason != nil {
		rc.lastError = reason
	} else {
		rc.lastError = ErrRelayClosedExternally
	}
	rc.lastUsed = time.Now()
	
	// If there were waiters for connection, send error result
	if rc.waiters > 0 {
		result := ConnectionResult{
			Relay: nil,
			Error: reason,
		}
		select {
		case rc.connectionResult <- result:
		default:
		}
	}
}

// Release decrements the subscriber count
func (rc *RelayConnection) Release() {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	
	if rc.status != RelayStatusConnected {
		return
	}
	
	rc.subscribers--
	if rc.subscribers < 0 {
		rc.subscribers = 0
	}
}

// CanCleanup returns true if the connection can be cleaned up
func (rc *RelayConnection) CanCleanup(idleTimeout time.Duration) bool {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	
	return rc.subscribers <= 0 &&
		(rc.status == RelayStatusConnected || rc.status == RelayStatusFailed) &&
		time.Since(rc.lastUsed) > idleTimeout
}

// IsStuck returns true if the connection is stuck in connecting state
func (rc *RelayConnection) IsStuck(timeout time.Duration) bool {
	rc.mu.RLock()
	defer rc.mu.RUnlock()
	
	return rc.status == RelayStatusConnecting && time.Since(rc.lastUsed) > timeout
}

// MarkAsStuck marks a stuck connection as failed
func (rc *RelayConnection) MarkAsStuck() {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	
	if rc.status == RelayStatusConnecting && time.Since(rc.lastUsed) > time.Minute*2 {
		rc.status = RelayStatusFailed
		rc.lastError = ErrConnectionTimeout
		
		// Notify any waiters
		if rc.waiters > 0 {
			result := ConnectionResult{
				Relay: nil,
				Error: ErrConnectionTimeout,
			}
			select {
			case rc.connectionResult <- result:
			default:
			}
		}
	}
}

// Close safely closes the connection and cleans up resources
func (rc *RelayConnection) Close() {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	
	if rc.closed {
		return
	}
	
	rc.closed = true
	
	if rc.relay != nil {
		relay := rc.relay
		rc.relay = nil
		rc.mu.Unlock()
		relay.Close()
		rc.mu.Lock()
	}
	
	rc.status = RelayStatusDisconnected
	
	// Close the channel to wake up any waiters
	if rc.connectionResult != nil {
		close(rc.connectionResult)
		rc.connectionResult = nil
	}
}

