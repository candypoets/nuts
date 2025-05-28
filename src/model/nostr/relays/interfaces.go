package relays

import (
	"context"
	"time"

	"github.com/candypoets/nutscash/nostr/types"
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
		return "Unknown"
	}
}

// NetworkEventType represents the type of network event
type NetworkEventType int

const (
	NetworkEventTypeEvent NetworkEventType = iota
	NetworkEventTypeEOSE
	NetworkEventTypeError
	NetworkEventTypeConnectionStatus
)

func (t NetworkEventType) String() string {
	switch t {
	case NetworkEventTypeEvent:
		return "Event"
	case NetworkEventTypeEOSE:
		return "EOSE"
	case NetworkEventTypeError:
		return "Error"
	case NetworkEventTypeConnectionStatus:
		return "ConnectionStatus"
	default:
		return "Unknown"
	}
}

// RelayManager defines the interface for managing relay connections
type RelayManager interface {
	GetRelay(url string) (*nostr.Relay, error)
	GetRelayAsync(ctx context.Context, url string) (*nostr.Relay, error)
	ReleaseRelay(url string)
	MarkRelayAsClosed(url string, reason error)
	PickRandomRelay() *nostr.Relay
	GetConnectionCount() int
	GetStats() RelayManagerStats
	Close()
}

// NetworkProcessor defines the interface for processing network requests
type NetworkProcessor interface {
	ProcessNetworkRequests(ctx context.Context, requests []types.Request) <-chan NetworkEvent
	GetConnectionStats() interface{}
	ValidateFilters(filters []nostr.Filter) error
}

// EventParser defines the interface for parsing Nostr events
type EventParser interface {
	Parse(event nostr.Event) (types.ParsedEvent, error)
	GetRelayHint(event nostr.Event)
}

// SubscriptionOptimizer defines the interface for optimizing subscriptions
type SubscriptionOptimizer interface {
	OptimizeSubscriptions(requests []types.Request) []types.Request
}

// ConnectionRegistry defines the interface for managing connection registry
type ConnectionRegistry interface {
	GetOrCreate(url string) RelayConnectionInterface
	Get(url string) (RelayConnectionInterface, bool)
	GetAll() map[string]RelayConnectionInterface
	GetAllConnections() []RelayConnectionInterface
	Remove(url string) bool
	RemoveBatch(urls []string) int
	Count() int
	CountByStatus() map[RelayConnectionStatus]int
	GetConnectedRelays() []RelayConnectionInterface
	CleanupEligibleConnections(idleTimeout time.Duration) ([]string, []RelayConnectionInterface)
	GetStuckConnections(timeout time.Duration) []RelayConnectionInterface
	Exists(url string) bool
	GetStats() RegistryStats
}

// RelayConnectionInterface defines the interface for individual relay connections
type RelayConnectionInterface interface {
	GetStatus() RelayConnectionStatus
	GetRelay() *nostr.Relay
	GetURL() string
	GetSubscribers() int
	GetLastUsed() time.Time
	GetError() error
	GetErrorCount() int
	TryConnect(ctx context.Context, connectTimeout time.Duration) (*nostr.Relay, error)
	MarkAsClosed(reason error)
	Release()
	CanCleanup(idleTimeout time.Duration) bool
	IsStuck(timeout time.Duration) bool
	MarkAsStuck()
	Close()
}

// BrowserDetector provides methods to detect browser type
type BrowserDetector interface {
	IsSafari() bool
	IsChrome() bool
	GetBrowserInfo() BrowserInfo
}

// ConnectionResult represents the result of a connection attempt
type ConnectionResult struct {
	Relay *nostr.Relay
	Error error
}

// NetworkEvent represents a network event
type NetworkEvent struct {
	Type      NetworkEventType
	Event     *types.ParsedEvent
	EOSE      *types.EOSE
	Error     error
	Relay     string
	Timestamp time.Time
}

// BrowserInfo contains information about the browser
type BrowserInfo struct {
	Name      string
	Version   string
	IsSafari  bool
	IsChrome  bool
	UserAgent string
}

// Config holds configuration for relay management
type Config struct {
	ConnectTimeout     time.Duration
	MaxRetries         int
	CleanupInterval    time.Duration
	MaxConcurrentConns int
	SafariOptimized    bool
	Debug              bool
}

// RelayManagerStats represents comprehensive relay manager statistics
type RelayManagerStats struct {
	Registry          RegistryStats
	ActiveConnections int
	LastCleanup       time.Time
	TotalRequests     int64
	SuccessfulConns   int64
	FailedConns       int64
	Uptime            time.Duration
}

// RegistryStats represents statistics about the connections registry
type RegistryStats struct {
	TotalConnections  int
	ConnectedCount    int
	ConnectingCount   int
	DisconnectedCount int
	FailedCount       int
}

// ValidationError represents a filter validation error
type ValidationError struct {
	Field   string
	Index   int
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}

// Factory provides methods to create relay management components
type Factory struct {
	logger zerolog.Logger
}

// NewFactory creates a new factory for relay management components
func NewFactory(logger zerolog.Logger) *Factory {
	return &Factory{
		logger: logger,
	}
}

// CreateRelayManager creates a new relay manager
func (f *Factory) CreateRelayManager(connectTimeout time.Duration, maxRetries int) RelayManager {
	return NewRelayConnectionManager(connectTimeout, maxRetries)
}

// Configuration functions
func DefaultConfig() Config {
	return Config{
		ConnectTimeout:     time.Second * 10,
		MaxRetries:         3,
		CleanupInterval:    time.Second * 30,
		MaxConcurrentConns: 20,
		Debug:              false,
	}
}

// Common errors used across the relay management system
var (
	ErrConnectionFailed      = &connectionError{"relay connection failed"}
	ErrConnectionTimeout     = &connectionError{"relay connection timed out"}
	ErrRelayClosedExternally = &connectionError{"relay connection closed externally"}
	ErrManagerClosed         = &connectionError{"relay manager is closed"}
	ErrInvalidURL            = &connectionError{"invalid relay URL"}
	ErrSubscriptionFailed    = &connectionError{"subscription failed"}
	ErrContextCancelled      = &connectionError{"context was cancelled"}
	ErrTooManyConnections    = &connectionError{"too many concurrent connections"}
	ErrNilRelay              = &connectionError{"relay connection is nil"}
)

type connectionError struct {
	msg string
}

func (e *connectionError) Error() string {
	return e.msg
}
