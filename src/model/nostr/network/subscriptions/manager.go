//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"runtime"
	"strings"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/nostr/logger"
	"github.com/candypoets/nutscash/nostr/types"
	"github.com/rs/zerolog"
	"github.com/vmihailenco/msgpack/v5"
)

// Config holds configuration for the subscription manager
type Config struct {
	StagingInterval   time.Duration
	MaxRecursionDepth int
	EnableCaching     bool
	EventBufferSize   int
}

// DefaultConfig returns default configuration
func DefaultConfig() Config {
	return Config{
		StagingInterval:   5 * time.Second,
		MaxRecursionDepth: 2,
		EnableCaching:     true,
		EventBufferSize:   100,
	}
}

// subscriptionManager implements the SubscriptionManager interface
type subscriptionManager struct {
	registry         SubscriptionRegistry
	cacheProcessor   CacheProcessor
	networkProcessor NetworkProcessor
	database         EventDatabase
	stagingManager   EventStagingManager
	jsBridge         JavaScriptBridge
	config           Config
	logger           zerolog.Logger
	ctx              context.Context
	cancelFunc       context.CancelFunc
}

// NewSubscriptionManager creates a new subscription manager with dependency injection
func NewSubscriptionManager(
	database EventDatabase,
	parser EventParser,
	relayManager RelayManager,
	config Config,
) SubscriptionManager {
	ctx, cancel := context.WithCancel(context.Background())

	// Create sub-components
	registry := NewSubscriptionRegistry()
	optimizer := NewSubscriptionOptimizer(parser)
	cacheProcessor := NewCacheProcessor(database, parser, logger.WithComponent("cache"))
	networkProcessor := NewNetworkProcessor(relayManager, parser, optimizer, logger.WithComponent("network"))
	stagingManager := NewEventStagingManager(database, logger.WithComponent("staging"), config.StagingInterval)
	jsBridge := NewJavaScriptBridge()

	sm := &subscriptionManager{
		registry:         registry,
		cacheProcessor:   cacheProcessor,
		networkProcessor: networkProcessor,
		database:         database,
		stagingManager:   stagingManager,
		jsBridge:         jsBridge,
		config:           config,
		logger:           logger.WithComponent("subscriptions"),
		ctx:              ctx,
		cancelFunc:       cancel,
	}

	// Register JavaScript functions
	sm.registerJavaScriptFunctions()

	// Start background processes
	sm.stagingManager.StartStagingProcess(ctx)
	go sm.startCleanupProcess(ctx)

	return sm
}

// registerJavaScriptFunctions registers the WASM functions for JavaScript
func (sm *subscriptionManager) registerJavaScriptFunctions() {
	openFunc := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) < 2 {
			return js.Error{Value: js.ValueOf("Not enough arguments")}
		}

		subscriptionID := args[0].String()
		binaryData := args[1]

		// Convert JS Uint8Array to Go []byte
		length := binaryData.Length()
		goBytes := make([]byte, length)
		js.CopyBytesToGo(goBytes, binaryData)

		// Deserialize the binary data
		var requests []types.Request
		if err := msgpack.Unmarshal(goBytes, &requests); err != nil {
			return js.Error{Value: js.ValueOf("Failed to parse binary data: " + err.Error())}
		}

		// Open subscription
		if err := sm.OpenSubscription(subscriptionID, requests); err != nil {
			return js.Error{Value: js.ValueOf("Failed to open subscription: " + err.Error())}
		}

		return js.ValueOf(true)
	})

	closeFunc := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) < 1 {
			return js.Error{Value: js.ValueOf("Subscription ID required")}
		}

		subscriptionID := args[0].String()
		go sm.CloseSubscription(subscriptionID)
		return nil
	})

	sm.jsBridge.RegisterFunction("openSubscription", openFunc)
	sm.jsBridge.RegisterFunction("closeSubscription", closeFunc)
}

// OpenSubscription starts a new subscription
func (sm *subscriptionManager) OpenSubscription(subscriptionID string, requests []types.Request) error {
	sm.logger.Info().
		Str("subscription_id", subscriptionID).
		Int("request_count", len(requests)).
		Msg("Opening subscription")

	// Create new subscription (this will close any existing subscription with the same ID)
	subscription := sm.registry.Create(subscriptionID)

	// Process the subscription in a goroutine
	go sm.processSubscription(subscription, requests)

	sm.logger.Info().
		Str("subscription_id", subscriptionID).
		Int("request_count", len(requests)).
		Msg("Opened subscription successfully")

	return nil
}

// CloseSubscription closes a subscription by ID
func (sm *subscriptionManager) CloseSubscription(subscriptionID string) {
	sm.logger.Info().
		Str("subscription_id", subscriptionID).
		Int("goroutines", runtime.NumGoroutine()).
		Msg("Closing subscription")

	sm.registry.Remove(subscriptionID)

	sm.logger.Info().
		Str("subscription_id", subscriptionID).
		Int("goroutines", runtime.NumGoroutine()).
		Msg("Closed subscription")
}

// GetActiveSubscriptionCount returns the number of active subscriptions
func (sm *subscriptionManager) GetActiveSubscriptionCount() int {
	return sm.registry.Count()
}

// processSubscription handles the complete subscription lifecycle
func (sm *subscriptionManager) processSubscription(subscription Subscription, requests []types.Request) {
	ctx := subscription.Context()
	subscriptionID := subscription.ID()

	// Check if this is a count-only or noContext subscription
	hasCountRequest := false
	hasNoContextRequest := false
	for _, req := range requests {
		if req.Count {
			hasCountRequest = true
		}
		if req.NoContext {
			hasNoContextRequest = true
		}
	}

	// First, process local requests (cache)
	networkRequests, cachedEvents, err := sm.cacheProcessor.ProcessLocalRequests(ctx, requests, 0)
	if err != nil {
		sm.logger.Warn().
			Err(err).
			Str("subscription_id", subscriptionID).
			Msg("Error processing local requests")
	}

	// For count requests, count the cached events instead of sending them
	if hasCountRequest {
		totalCount := 0
		// Only count the first event in each group (main event, not context)
		for _, events := range cachedEvents {
			if len(events) > 0 {
				totalCount++
			}
		}

		// Process network requests and count those too
		if len(networkRequests) > 0 {
			totalCount += sm.processNetworkSubscriptionForCount(subscription, networkRequests)
		}

		// Send the total count
		sm.sendCount(subscription, totalCount)
	} else if hasNoContextRequest {
		// For noContext requests, send events without context
		if len(cachedEvents) > 0 {
			sm.sendCachedEventsWithoutContext(subscription, cachedEvents)
			// Mark cached events as sent
			for _, events := range cachedEvents {
				if len(events) > 0 {
					subscription.MarkEventAsSent(events[0].ID, []types.ParsedEvent{events[0]})
				}
			}
		}

		// Send end of cached events
		sm.jsBridge.PostMessage("EOCE", subscriptionID, js.Null())

		// Check if subscription was cancelled
		if ctx.Err() != nil {
			return
		}

		// Process network requests if any remain
		if len(networkRequests) > 0 {
			sm.processNetworkSubscriptionWithoutContext(subscription, networkRequests)
		}
	} else {
		// Normal event processing
		// Send cached events in batch
		if len(cachedEvents) > 0 {
			sm.sendCachedEventsBatch(subscription, cachedEvents)
			// Mark cached events as sent
			for _, events := range cachedEvents {
				subscription.MarkEventAsSent(events[0].ID, events)
			}
		}

		// Send end of cached events
		sm.jsBridge.PostMessage("EOCE", subscriptionID, js.Null())

		// Check if subscription was cancelled
		if ctx.Err() != nil {
			return
		}

		// Process network requests if any remain
		if len(networkRequests) > 0 {
			sm.processNetworkSubscription(subscription, networkRequests)
		}
	}
}

// sendCount sends the total count to JavaScript
func (sm *subscriptionManager) sendCount(subscription Subscription, totalCount int) {
	subscriptionID := subscription.ID()

	sm.logger.Debug().
		Str("subscription_id", subscriptionID).
		Int("total_count", totalCount).
		Msg("Sending count result")

	// Send count result
	pack, err := msgpack.Marshal(totalCount)
	if err != nil {
		sm.logger.Error().
			Err(err).
			Str("subscription_id", subscriptionID).
			Msg("Error marshaling count result")
		return
	}

	uint8Array := js.Global().Get("Uint8Array").New(len(pack))
	js.CopyBytesToJS(uint8Array, pack)

	sm.jsBridge.PostMessage("COUNT", subscriptionID, uint8Array)
}

// sendCachedEventsWithoutContext sends cached events without context as individual events
func (sm *subscriptionManager) sendCachedEventsWithoutContext(subscription Subscription, cachedEvents [][]types.ParsedEvent) {
	eventsWithoutContext := make([][]types.ParsedEvent, 0, len(cachedEvents))

	// Extract only the main event from each group (first event, skip context)
	for _, events := range cachedEvents {
		if len(events) > 0 {
			mainEvent := events[0] // Only the main event
			// Remove requests field for noContext responses
			mainEvent.Requests = nil
			eventsWithoutContext = append(eventsWithoutContext, []types.ParsedEvent{mainEvent})
		}
	}

	if len(eventsWithoutContext) > 0 {
		// Pack events without context into msgpack payload
		pack, err := msgpack.Marshal(eventsWithoutContext)
		if err != nil {
			sm.logger.Error().
				Err(err).
				Str("subscription_id", subscription.ID()).
				Msg("Error marshaling cached events without context")
			return
		}

		uint8Array := js.Global().Get("Uint8Array").New(len(pack))
		js.CopyBytesToJS(uint8Array, pack)

		sm.jsBridge.PostMessage("CACHED_EVENT", subscription.ID(), uint8Array)
	}
}

// processNetworkSubscriptionForCount handles network subscription processing for count requests
func (sm *subscriptionManager) processNetworkSubscriptionForCount(subscription Subscription, requests []types.Request) int {
	ctx := subscription.Context()
	subscriptionID := subscription.ID()
	totalCount := 0

	// Start network processing
	eventChan := sm.networkProcessor.ProcessNetworkRequests(ctx, requests)

	// Process events from network and count them
	for {
		select {
		case <-ctx.Done():
			return totalCount

		case networkEvent, more := <-eventChan:
			if !more {
				return totalCount
			}

			switch networkEvent.Type {
			case NetworkEventTypeEvent:
				// Count the event and its context
				event := networkEvent.Event

				// Check if event was already counted
				if !subscription.HasEventBeenSent(event.ID) {
					subscription.MarkEventAsSent(event.ID, []types.ParsedEvent{*event})

					// Count only the main event, ignore context events
					totalCount++
				}

			case NetworkEventTypeEOSE:
				// Continue counting until all relays finish

			case NetworkEventTypeError:
				sm.logger.Error().
					Err(networkEvent.Error).
					Str("subscription_id", subscriptionID).
					Str("relay", networkEvent.Relay).
					Msg("Network event error during count")
			}
		}
	}
}

// processNetworkSubscriptionWithoutContext handles network subscription processing for noContext requests
func (sm *subscriptionManager) processNetworkSubscriptionWithoutContext(subscription Subscription, requests []types.Request) {
	ctx := subscription.Context()
	subscriptionID := subscription.ID()

	// Start network processing
	eventChan := sm.networkProcessor.ProcessNetworkRequests(ctx, requests)

	// Process events from network
	for {
		select {
		case <-ctx.Done():
			return

		case networkEvent, more := <-eventChan:
			if !more {
				return
			}

			switch networkEvent.Type {
			case NetworkEventTypeEvent:
				sm.handleNetworkEventWithoutContext(subscription, networkEvent)

			case NetworkEventTypeEOSE:
				sm.handleEOSE(subscription, networkEvent)

			case NetworkEventTypeError:
				sm.logger.Error().
					Err(networkEvent.Error).
					Str("subscription_id", subscriptionID).
					Str("relay", networkEvent.Relay).
					Msg("Network event error")
			}
		}
	}
}

// handleNetworkEventWithoutContext processes a single network event without context
func (sm *subscriptionManager) handleNetworkEventWithoutContext(subscription Subscription, networkEvent NetworkEvent) {
	event := networkEvent.Event
	subscriptionID := subscription.ID()

	// Check if event was already sent
	if subscription.HasEventBeenSent(event.ID) {
		return
	}

	// Mark as sent (only the main event, no context)
	subscription.MarkEventAsSent(event.ID, []types.ParsedEvent{*event})

	// Add to database if caching is enabled
	if sm.config.EnableCaching && !strings.HasSuffix(subscriptionID, "nocache") {
		sm.database.AddEvent(*event)

		// Stage for persistent storage if it's a cacheable event kind
		if sm.cacheProcessor.ShouldCacheEvent(*event) {
			sm.stagingManager.StageEvent(*event)
		}
	}

	// Send only the main event without context and remove requests field
	eventCopy := *event
	eventCopy.Requests = nil
	mainEventOnly := []types.ParsedEvent{eventCopy}

	// Handle batching vs real-time mode
	if subscription.IsInBatchingMode() {
		// Add to batch instead of sending immediately
		subscription.AddToFetchedBatch(mainEventOnly)
	} else {
		// Send individual event (wrapped in array of arrays for consistency)
		eventBatch := [][]types.ParsedEvent{mainEventOnly}
		sm.sendFetchedEventsBatch(subscriptionID, eventBatch)
	}
}

// sendCachedEventsBatch sends all cached events as a single batch to JavaScript
func (sm *subscriptionManager) sendCachedEventsBatch(subscription Subscription, cachedEvents [][]types.ParsedEvent) {
	// Pack all cached events into a single msgpack payload
	pack, err := msgpack.Marshal(cachedEvents)
	if err != nil {
		sm.logger.Error().
			Err(err).
			Str("subscription_id", subscription.ID()).
			Msg("Error marshaling cached events batch")
		return
	}

	uint8Array := js.Global().Get("Uint8Array").New(len(pack))
	js.CopyBytesToJS(uint8Array, pack)

	sm.jsBridge.PostMessage("CACHED_EVENT", subscription.ID(), uint8Array)
}

// sendFetchedEventsBatch sends fetched events as a batch to JavaScript
func (sm *subscriptionManager) sendFetchedEventsBatch(subscriptionID string, fetchedEvents [][]types.ParsedEvent) {
	// Pack all fetched events into a single msgpack payload
	pack, err := msgpack.Marshal(fetchedEvents)
	if err != nil {
		sm.logger.Error().
			Err(err).
			Str("subscription_id", subscriptionID).
			Msg("Error marshaling fetched events batch")
		return
	}

	uint8Array := js.Global().Get("Uint8Array").New(len(pack))
	js.CopyBytesToJS(uint8Array, pack)

	sm.jsBridge.PostMessage("FETCHED_EVENT", subscriptionID, uint8Array)
}

// processNetworkSubscription handles network subscription processing
func (sm *subscriptionManager) processNetworkSubscription(subscription Subscription, requests []types.Request) {
	ctx := subscription.Context()
	subscriptionID := subscription.ID()

	// Start network processing
	eventChan := sm.networkProcessor.ProcessNetworkRequests(ctx, requests)

	// Process events from network
	for {
		select {
		case <-ctx.Done():
			return

		case networkEvent, more := <-eventChan:
			if !more {
				return
			}

			switch networkEvent.Type {
			case NetworkEventTypeEvent:
				sm.handleNetworkEvent(subscription, networkEvent)

			case NetworkEventTypeEOSE:
				sm.handleEOSE(subscription, networkEvent)

			case NetworkEventTypeError:
				sm.logger.Error().
					Err(networkEvent.Error).
					Str("subscription_id", subscriptionID).
					Str("relay", networkEvent.Relay).
					Msg("Network event error")
			}
		}
	}
}

// handleNetworkEvent processes a single network event
func (sm *subscriptionManager) handleNetworkEvent(subscription Subscription, networkEvent NetworkEvent) {
	event := networkEvent.Event
	subscriptionID := subscription.ID()

	// Check if event was already sent
	if subscription.HasEventBeenSent(event.ID) {
		return
	}

	// Mark as sent
	subscription.MarkEventAsSent(event.ID, []types.ParsedEvent{*event})

	// Add to database if caching is enabled
	if sm.config.EnableCaching && !strings.HasSuffix(subscriptionID, "nocache") {
		sm.database.AddEvent(*event)

		// Stage for persistent storage if it's a cacheable event kind
		if sm.cacheProcessor.ShouldCacheEvent(*event) {
			sm.stagingManager.StageEvent(*event)
		}
	}

	// Build context for the event
	contextEvents := sm.cacheProcessor.FindEventContext(*event, sm.config.MaxRecursionDepth)

	// Add context events to the sent events
	allEvents := append([]types.ParsedEvent{*event}, contextEvents...)

	// Handle batching vs real-time mode
	if subscription.IsInBatchingMode() {
		// Add to batch instead of sending immediately
		subscription.AddToFetchedBatch(allEvents)
	} else {
		// Send individual event (wrapped in array of arrays for consistency)
		eventBatch := [][]types.ParsedEvent{allEvents}
		sm.sendFetchedEventsBatch(subscriptionID, eventBatch)
	}
}

// handleEOSE processes End of Stored Events
func (sm *subscriptionManager) handleEOSE(subscription Subscription, networkEvent NetworkEvent) {
	subscriptionID := subscription.ID()

	eose := networkEvent.EOSE
	if eose == nil {
		sm.logger.Warn().
			Str("subscription_id", subscriptionID).
			Msg("Received EOSE with no data")
		return
	}

	sm.logger.Debug().
		Str("subscription_id", subscriptionID).
		Int("remaining_connections", eose.RemainingConnections).
		Int("total_connections", eose.TotalConnections).
		Msg("Received EOSE")

	// Send current batch on each EOSE for progressive loading
	if subscription.IsInBatchingMode() {
		fetchedBatch := subscription.GetFetchedBatch()
		if len(fetchedBatch) > 0 {
			sm.sendFetchedEventsBatch(subscriptionID, fetchedBatch)
			subscription.ClearFetchedBatch()

			sm.logger.Debug().
				Str("subscription_id", subscriptionID).
				Int("batched_events", len(fetchedBatch)).
				Msg("Sent batched events on EOSE")
		}

		// Switch to real-time mode when no remaining connections
		if eose.RemainingConnections <= 0 {
			subscription.SetBatchingMode(false)

			sm.logger.Debug().
				Str("subscription_id", subscriptionID).
				Msg("Switched to real-time mode - all relays sent EOSE")
		}
	}

	// Send EOSE notification
	pack, err := msgpack.Marshal(networkEvent.EOSE)
	if err != nil {
		sm.logger.Error().
			Err(err).
			Str("subscription_id", subscriptionID).
			Msg("Error marshaling EOSE")
		return
	}

	uint8Array := js.Global().Get("Uint8Array").New(len(pack))
	js.CopyBytesToJS(uint8Array, pack)

	sm.jsBridge.PostMessage("EOSE", subscriptionID, uint8Array)
}

// startCleanupProcess starts a background cleanup process
func (sm *subscriptionManager) startCleanupProcess(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sm.registry.Cleanup()
		}
	}
}

// Close gracefully shuts down the subscription manager
func (sm *subscriptionManager) Close() error {
	sm.logger.Info().Msg("Shutting down subscription manager")

	// Cancel all subscriptions
	sm.cancelFunc()

	// Clean up registry
	for _, id := range sm.registry.List() {
		sm.registry.Remove(id)
	}

	sm.logger.Info().Msg("Subscription manager shut down complete")
	return nil
}

// GetStatistics returns manager statistics
func (sm *subscriptionManager) GetStatistics() ManagerStats {
	return ManagerStats{
		ActiveSubscriptions: sm.registry.Count(),
		SubscriptionIDs:     sm.registry.List(),
		Uptime:              time.Since(time.Now()), // This would track actual uptime
	}
}

// ManagerStats represents subscription manager statistics
type ManagerStats struct {
	ActiveSubscriptions int
	SubscriptionIDs     []string
	Uptime              time.Duration
}
