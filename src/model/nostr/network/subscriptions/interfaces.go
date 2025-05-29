//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"syscall/js"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// EventDatabase defines the interface for event storage and retrieval
type EventDatabase interface {
	QueryEventsForRequests(requests []types.Request, skipFiltered bool) ([]types.Request, []types.ParsedEvent, error)
	QueryEvents(filter nostr.Filter) ([]types.ParsedEvent, error)
	AddEvent(event types.ParsedEvent) error
	SaveEventsToPersistentStorage(events []types.ParsedEvent) error
}

// EventParser defines the interface for parsing Nostr events
type EventParser interface {
	Parse(event nostr.Event) (types.ParsedEvent, error)
	GetRelayHint(event nostr.Event) []string
	GetRelays(kind int, pubkey string, write ...bool) []string
}

// RelayManager defines the interface for managing relay connections
type RelayManager interface {
	GetRelay(url string) (*nostr.Relay, error)
	ReleaseRelay(url string)
	MarkRelayAsClosed(url string, err error)
}

// JavaScriptBridge defines the interface for WASM/JS communication
type JavaScriptBridge interface {
	PostMessage(eventType, subscriptionID string, data js.Value)
	RegisterFunction(name string, fn js.Func)
}

// SubscriptionOptimizer defines the interface for optimizing subscription requests
type SubscriptionOptimizer interface {
	OptimizeSubscriptions(requests []types.Request) []types.Request
}

// CacheProcessor handles local event processing
type CacheProcessor interface {
	ProcessLocalRequests(ctx context.Context, requests []types.Request, depth int) ([]types.Request, [][]types.ParsedEvent, error)
	FindEventContext(event types.ParsedEvent, maxDepth int) []types.ParsedEvent
	ShouldCacheEvent(event types.ParsedEvent) bool
}

// NetworkProcessor handles network subscription processing
type NetworkProcessor interface {
	ProcessNetworkRequests(ctx context.Context, requests []types.Request) <-chan NetworkEvent
}

// NetworkEvent represents events from network processing
type NetworkEvent struct {
	Type  NetworkEventType
	Event *types.ParsedEvent
	Error error
	Relay string
	EOSE  *types.EOSE
}

type NetworkEventType int

const (
	NetworkEventTypeEvent NetworkEventType = iota
	NetworkEventTypeEOSE
	NetworkEventTypeError
)

// Subscription represents an active subscription
type Subscription interface {
	ID() string
	Cancel()
	Context() context.Context
	IsCancelled() bool
	GetSentEvents() map[string]*[]types.ParsedEvent
	MarkEventAsSent(eventID string, events []types.ParsedEvent)
	HasEventBeenSent(eventID string) bool
	
	// FETCHED_EVENT batching support
	AddToFetchedBatch(events []types.ParsedEvent)
	GetFetchedBatch() [][]types.ParsedEvent
	ClearFetchedBatch()
	IsInBatchingMode() bool
	SetBatchingMode(batching bool)
}

// SubscriptionRegistry manages active subscriptions
type SubscriptionRegistry interface {
	Create(id string) Subscription
	Get(id string) (Subscription, bool)
	Remove(id string)
	Count() int
	List() []string
	Cleanup()
}

// EventStagingManager handles event staging for persistent storage
type EventStagingManager interface {
	StageEvent(event types.ParsedEvent)
	StartStagingProcess(ctx context.Context)
}

// SubscriptionManager defines the main subscription management interface
type SubscriptionManager interface {
	OpenSubscription(subscriptionID string, requests []types.Request) error
	CloseSubscription(subscriptionID string)
	GetActiveSubscriptionCount() int
}
