//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"syscall/js"

	"github.com/candypoets/nutscash/db"
	"github.com/candypoets/nutscash/parser"
	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
	"github.com/vmihailenco/msgpack/v5"
)

// SubscriptionManager manages all active subscriptions
type SubscriptionManager struct {
	subscriptions map[string]*Subscription
	mutex         sync.Mutex
	database      *db.NostrDB
	parser        *parser.Parser
}

// NewSubscriptionManager creates a new subscription manager
func NewSubscriptionManager(database *db.NostrDB, parser *parser.Parser) *SubscriptionManager {
	return &SubscriptionManager{
		subscriptions: make(map[string]*Subscription),
		database:      database,
		parser:        parser,
	}
}

// Subscription tracks a subscription
type Subscription struct {
	ID            string
	Pool          *nostr.SimplePool
	Ctx           context.Context
	CancelFunc    context.CancelFunc
	Subscriptions []*nostr.Subscription
}

// openSubscriptions starts a new subscription
func (sm *SubscriptionManager) OpenSubscription(subscriptionID string, requests []types.Request, callback js.Func) interface{} {
	fmt.Println(fmt.Sprintf("Opening subscription for ID: %s and %d requests", subscriptionID, len(requests)))
	if sm.subscriptions[subscriptionID] != nil {
		sm.CloseSubscription(subscriptionID)
	}

	// Create a new pool for this subscription
	ctx, cancel := context.WithCancel(context.Background())

	pool := nostr.NewSimplePool(ctx)
	// Create subscription record
	sm.mutex.Lock()
	subscription := &Subscription{
		ID:         subscriptionID,
		Pool:       pool,
		Ctx:        ctx,
		CancelFunc: cancel,
	}
	sm.subscriptions[subscriptionID] = subscription
	sm.mutex.Unlock()

	sm.ProcessLocalRequests(requests, callback, 0)

	sm.ProcessSubscriptionRequests(ctx, pool, requests, callback, 0)
	return nil
}

// CloseSubscription closes a subscription by ID
func (sm *SubscriptionManager) CloseSubscription(subscriptionID string) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	if sub, exists := sm.subscriptions[subscriptionID]; exists {
		// Cancel the context to close all subscriptions
		sub.CancelFunc()
		delete(sm.subscriptions, subscriptionID)
	}
}

// ProcessLocalRequests searches for events in the database based on requests,
// processes them, and recursively handles any resulting requests up to a maximum depth of 3.
func (sm *SubscriptionManager) ProcessLocalRequests(
	requests []types.Request,
	callback js.Func,
	depth int) {
	println(fmt.Sprintf("Processing local requests at depth %d", depth))
	// Check recursion depth limit
	if depth >= 3 {
		println("Warning: Reached maximum recursion depth (3) for local requests")
		return
	}

	var filters = []nostr.Filter{}

	for _, req := range requests {
		filters = append(filters, nostr.Filter{
			IDs:     req.IDs,
			Kinds:   req.Kinds,
			Authors: req.Authors,
			Since:   req.Since,
			Until:   req.Until,
			Limit:   req.Limit,
			Tags:    req.Tags,
		})
	}

	filters = MergeFilters(filters)
	// For each merged filter, search the database
	for _, filter := range filters {
		// Convert request to database filter format
		// Log the parsed requests array as JSON
		debugJSON, err := json.Marshal(filter)
		if err != nil {
			js.Global().Get("console").Call("error", "Failed to marshal requests for debugging:", err.Error())
		} else {
			js.Global().Get("console").Call("log", "Parsed filter:", string(debugJSON))
		}
		// Query the database for events matching the filter
		events, err := sm.database.QueryEvents(filter)
		if err != nil {
			println("Error querying database:", err)
			continue
		}

		debug, err := json.MarshalIndent(events, "", "  ")
		if err != nil {
			js.Global().Get("console").Call("error", "Failed to marshal requests for debugging:", err.Error())
		} else {
			js.Global().Get("console").Call("log", "Parsed events:", string(debug))
		}

		// Process each event found
		for _, event := range events {
			// Parse the event to generate UI data and potential recursive requests
			parsedEvent, newRequests, err := sm.parser.Parse(nostr.Event{
				ID:        event.ID,
				Kind:      event.Kind,
				CreatedAt: event.CreatedAt,
				Tags:      event.Tags,
				Content:   event.Content,
			})
			if err != nil {
				println("Error parsing event from database:", err)
				continue
			}

			// If we have new requests from parsing this event,
			// process them recursively, but with incremented depth
			if newRequests != nil && len(*newRequests) > 0 {
				// Process recursively with increased depth
				sm.ProcessLocalRequests(*newRequests, callback, depth+1)
			}

			// Convert parsed event for callback
			event, err := msgpack.Marshal(parsedEvent)
			if err != nil {
				continue
			}
			// Create a JavaScript Uint8Array to hold the MessagePack data
			uint8Array := js.Global().Get("Uint8Array").New(len(event))

			// Copy the Go bytes to the JavaScript Uint8Array
			js.CopyBytesToJS(uint8Array, event)

			// Call the callback with the event (same format as subscription events)
			callback.Invoke("CACHED_EVENTS", uint8Array)
		}
	}
}

// Recursively handles a set of subscription requests.
// It recursively processes subscriptions at different depths. Depending on the requests returned
// by the different event parsing
// At depth 0, subscriptions remain open for real-time updates.
// At greater depths, subscriptions close after EOSE.
func (sm *SubscriptionManager) ProcessSubscriptionRequests(
	ctx context.Context,
	pool *nostr.SimplePool,
	requests []types.Request,
	callback js.Func,
	depth int) {
	println(fmt.Sprintf("Processing subscription requests at depth %d, %s", depth, callback))
	// Check recursion depth limit
	if depth >= 3 {
		println("Warning: Reached maximum recursion depth (3) for subscription requests")
		return
	}

	if requests == nil {
		return
	}

	var wg sync.WaitGroup

	// Optimize subscription requests
	optimizedRequests := OptimizeSubscriptions(requests)

	println(fmt.Sprintf("Processing subscription requests at depth %d, %s", len(optimizedRequests), callback))

	for _, req := range optimizedRequests {
		relays := req.Relays
		filters := req.Filters

		if len(relays) == 0 {
			continue
		}

		for _, filter := range filters {
			wg.Add(1)

			// Create a subscription context that can be cancelled
			subCtx, cancelSub := context.WithCancel(ctx)

			go func(relays []string, filter nostr.Filter) {
				defer wg.Done()

				eoseChan := make(chan struct{})

				// Subscribe to events
				sub := pool.SubscribeManyNotifyEOSE(subCtx, relays, filter, eoseChan)

				// Process events as they arrive
				go func() {
					for ev := range sub {
						// Process the event
						parsedEvent, newRequests, err := sm.parser.Parse(*ev.Event)
						if err != nil {
							println("Error parsing event:", err.Error())
							continue
						}

						// Add to in-memory database
						sm.database.AddEvent(*ev.Event)

						// Excerpt from: func (sm *SubscriptionManager) ProcessSubscriptionRequests
						// First process any new requests that came from parsing this event
						if newRequests != nil && len(*newRequests) > 0 {
							// Process new requests synchronously before continuing
							sm.ProcessSubscriptionRequests(ctx, pool, *newRequests, callback, depth+1)
						}

						// Convert to JSON for callback
						event, err := msgpack.Marshal(parsedEvent)
						if err != nil {
							println("Error marshaling event:", err.Error())
							continue
						}
						// Create a JavaScript Uint8Array to hold the MessagePack data
						uint8Array := js.Global().Get("Uint8Array").New(len(event))

						// Copy the Go bytes to the JavaScript Uint8Array
						js.CopyBytesToJS(uint8Array, event)

						// Only call the callback after all related requests are processed
						callback.Invoke("FETCHED_EVENTS", uint8Array)
					}
				}()

				// Wait for EOSE
				<-eoseChan

				// Notify callback about EOSE
				relaysJSON, _ := json.Marshal(relays)
				callback.Invoke("EOSE", string(relaysJSON))

				// For depth > 0, close the subscription after EOSE
				// For depth 0, keep the subscription open for real-time updates
				if depth > 0 {
					cancelSub()
					println("Closed subscription at depth", depth, "after EOSE")
				} else {
					println("Keeping subscription open at depth 0 for real-time updates")
				}

			}(relays, filter)
		}
	}

	// For non-zero depths, wait for all subscriptions to complete
	// For depth 0, we return immediately while subscriptions stay alive
	if depth > 0 {
		wg.Wait()
	}
}
