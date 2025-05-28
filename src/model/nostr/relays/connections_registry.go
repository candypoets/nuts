package relays

import (
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// ConnectionsRegistry manages the registry of relay connections
type ConnectionsRegistry struct {
	connections map[string]*RelayConnection
	mu          sync.RWMutex
	log         zerolog.Logger
}

// NewConnectionsRegistry creates a new connections registry
func NewConnectionsRegistry(log zerolog.Logger) *ConnectionsRegistry {
	return &ConnectionsRegistry{
		connections: make(map[string]*RelayConnection),
		log:         log,
	}
}

// GetOrCreate returns an existing connection or creates a new one
func (cr *ConnectionsRegistry) GetOrCreate(url string) RelayConnectionInterface {
	cr.mu.Lock()
	defer cr.mu.Unlock()

	// Validate URL
	if url == "" {
		cr.log.Error().Msg("GetOrCreate called with empty URL")
		return nil
	}

	conn, exists := cr.connections[url]
	if !exists {
		conn = NewRelayConnection(url)
		if conn == nil {
			cr.log.Error().Str("relay", url).Msg("NewRelayConnection returned nil")
			return nil
		}
		cr.connections[url] = conn
		cr.log.Debug().Str("relay", url).Msg("Created new connection entry")
	}

	// Ensure connection is not nil before returning
	if conn == nil {
		cr.log.Error().Str("relay", url).Msg("Connection is nil in registry")
		// Try to clean up the nil entry
		delete(cr.connections, url)
		return nil
	}

	return conn
}

// Get returns an existing connection if it exists
func (cr *ConnectionsRegistry) Get(url string) (RelayConnectionInterface, bool) {
	cr.mu.RLock()
	defer cr.mu.RUnlock()

	conn, exists := cr.connections[url]
	return conn, exists
}

// GetAll returns a snapshot of all connections
func (cr *ConnectionsRegistry) GetAll() map[string]RelayConnectionInterface {
	cr.mu.RLock()
	defer cr.mu.RUnlock()

	snapshot := make(map[string]RelayConnectionInterface, len(cr.connections))
	for url, conn := range cr.connections {
		snapshot[url] = conn
	}

	return snapshot
}

// GetAllConnections returns a slice of all connections for iteration
func (cr *ConnectionsRegistry) GetAllConnections() []RelayConnectionInterface {
	cr.mu.RLock()
	defer cr.mu.RUnlock()

	connections := make([]RelayConnectionInterface, 0, len(cr.connections))
	for _, conn := range cr.connections {
		if conn != nil {
			connections = append(connections, conn)
		}
	}

	return connections
}

// Remove removes a connection from the registry
func (cr *ConnectionsRegistry) Remove(url string) bool {
	cr.mu.Lock()
	defer cr.mu.Unlock()

	if _, exists := cr.connections[url]; exists {
		delete(cr.connections, url)
		cr.log.Debug().Str("relay", url).Msg("Removed connection from registry")
		return true
	}

	return false
}

// RemoveBatch removes multiple connections from the registry
func (cr *ConnectionsRegistry) RemoveBatch(urls []string) int {
	if len(urls) == 0 {
		return 0
	}

	cr.mu.Lock()
	defer cr.mu.Unlock()

	removedCount := 0
	for _, url := range urls {
		if _, exists := cr.connections[url]; exists {
			delete(cr.connections, url)
			removedCount++
		}
	}

	if removedCount > 0 {
		cr.log.Debug().Int("removed_count", removedCount).Msg("Removed connections from registry")
	}

	return removedCount
}

// Count returns the total number of connections
func (cr *ConnectionsRegistry) Count() int {
	cr.mu.RLock()
	defer cr.mu.RUnlock()
	return len(cr.connections)
}

// CountByStatus returns counts of connections by status
func (cr *ConnectionsRegistry) CountByStatus() map[RelayConnectionStatus]int {
	cr.mu.RLock()
	connections := make([]*RelayConnection, 0, len(cr.connections))
	for _, conn := range cr.connections {
		connections = append(connections, conn)
	}
	cr.mu.RUnlock()

	counts := make(map[RelayConnectionStatus]int)
	for _, conn := range connections {
		status := conn.GetStatus()
		counts[status]++
	}

	return counts
}

// GetConnectedRelays returns all currently connected relays
func (cr *ConnectionsRegistry) GetConnectedRelays() []RelayConnectionInterface {
	cr.mu.RLock()
	connections := make([]RelayConnectionInterface, 0, len(cr.connections))
	for _, conn := range cr.connections {
		if conn != nil {
			connections = append(connections, conn)
		}
	}
	cr.mu.RUnlock()

	var connected []RelayConnectionInterface
	for _, conn := range connections {
		if conn != nil && conn.GetStatus() == RelayStatusConnected && conn.GetRelay() != nil {
			connected = append(connected, conn)
		}
	}

	return connected
}

// CleanupEligibleConnections identifies connections that can be cleaned up
func (cr *ConnectionsRegistry) CleanupEligibleConnections(idleTimeout time.Duration) (urlsToDelete []string, connectionsToClose []RelayConnectionInterface) {
	connections := cr.GetAllConnections()

	for _, conn := range connections {
		if conn == nil {
			continue
		}
		
		url := conn.GetURL()

		// Check if connection can be cleaned up
		if conn.CanCleanup(idleTimeout) {
			urlsToDelete = append(urlsToDelete, url)
			connectionsToClose = append(connectionsToClose, conn)
		}
	}

	return urlsToDelete, connectionsToClose
}

// GetStuckConnections returns connections that are stuck in connecting state
func (cr *ConnectionsRegistry) GetStuckConnections(timeout time.Duration) []RelayConnectionInterface {
	connections := cr.GetAllConnections()

	var stuck []RelayConnectionInterface
	for _, conn := range connections {
		if conn != nil && conn.IsStuck(timeout) {
			stuck = append(stuck, conn)
		}
	}

	return stuck
}

// Exists checks if a connection exists for the given URL
func (cr *ConnectionsRegistry) Exists(url string) bool {
	cr.mu.RLock()
	defer cr.mu.RUnlock()

	_, exists := cr.connections[url]
	return exists
}

// GetStats returns statistics about the connections registry
func (cr *ConnectionsRegistry) GetStats() RegistryStats {
	counts := cr.CountByStatus()
	
	return RegistryStats{
		TotalConnections:       cr.Count(),
		ConnectedCount:        counts[RelayStatusConnected],
		ConnectingCount:       counts[RelayStatusConnecting],
		DisconnectedCount:     counts[RelayStatusDisconnected],
		FailedCount:          counts[RelayStatusFailed],
	}
}

