//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"fmt"
	"sync"
	"syscall/js"
	"time"

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
	stagedEvents  []types.ParsedEvent // keep a list of events to save to indexdb
}

// NewSubscriptionManager creates a new subscription manager
func NewSubscriptionManager(database *db.NostrDB, parser *parser.Parser) *SubscriptionManager {
	sm := &SubscriptionManager{
		subscriptions: make(map[string]*Subscription),
		database:      database,
		parser:        parser,
		stagedEvents:  []types.ParsedEvent{},
	}

	go func() {
		for {
			if len(sm.stagedEvents) > 0 {
				sm.database.SaveEventsToPersistentStorage(sm.stagedEvents)
				sm.stagedEvents = []types.ParsedEvent{}
			}
			time.Sleep(5 * time.Second)
		}
	}()

	return sm
}

// Subscription tracks a subscription
type Subscription struct {
	ID            string
	Pool          *nostr.SimplePool
	Ctx           context.Context
	CancelFunc    context.CancelFunc
	Subscriptions []*nostr.Subscription
	Sent          map[string]*[]types.ParsedEvent
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
		Sent:       make(map[string]*[]types.ParsedEvent),
		CancelFunc: cancel,
	}
	sm.subscriptions[subscriptionID] = subscription
	sm.mutex.Unlock()

	sm.ProcessLocalRequests(subscriptionID, requests, callback, 0)

	sm.ProcessSubscriptionRequests(subscriptionID, ctx, pool, requests, callback, 0)

	return nil
}

// CloseSubscription closes a subscription by ID
func (sm *SubscriptionManager) CloseSubscription(subscriptionID string) {
	println(fmt.Sprintf("Closing subscription: %s", subscriptionID))
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	if sub, exists := sm.subscriptions[subscriptionID]; exists {
		// Call cancel on the shared pool
		sub.Pool.Close(fmt.Sprintf("Closing subscription: %s", subscriptionID))
		// Cancel the context to close all subscriptions
		sub.CancelFunc()
		delete(sm.subscriptions, subscriptionID)
	}
}

// ProcessLocalRequests searches for events in the database based on requests,
// processes them, and recursively handles any resulting requests up to a maximum depth of 3.
func (sm *SubscriptionManager) ProcessLocalRequests(
	subscriptionID string,
	requests []types.Request,
	callback js.Func,
	depth int,
	root ...string) {
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
		// Query the database for events matching the filter
		events, err := sm.database.QueryEvents(filter)
		if err != nil {
			println("Error querying database:", err)
			return
		}

		// Process each event found
		for _, event := range events {
			rootID := event.Event.ID
			if len(root) > 0 {
				rootID = root[0]
			}
			// only on depth 0 do we check if the event has already been sent
			if depth == 0 {
				sm.mutex.Lock()
				// check before parsing event if it has already been treated
				if sm.subscriptions[subscriptionID].Sent[rootID] != nil {
					sm.mutex.Unlock()
					return
				}
				sm.subscriptions[subscriptionID].Sent[rootID] = &[]types.ParsedEvent{event}
				sm.mutex.Unlock()
			}

			if event.Parsed == nil {
				// Parse the event to generate UI data and potential recursive requests
				event, err = sm.parser.Parse(nostr.Event{
					ID:        event.ID,
					Kind:      event.Kind,
					CreatedAt: event.CreatedAt,
					Tags:      event.Tags,
					Content:   event.Content,
					PubKey:    event.PubKey,
					Sig:       event.Sig,
				})
				if err != nil {
					println("Error parsing event from database:", err)
					return
				}
			}

			// If we have new requests from parsing this event,
			// process them recursively, but with incremented depth
			if event.Requests != nil && len(*event.Requests) > 0 {
				// Process recursively with increased depth
				sm.ProcessLocalRequests(subscriptionID, *event.Requests, callback, depth+1, rootID)
			}

			if len(root) > 0 {
				sm.mutex.Lock()
				//@todo the line below is an ugly fix, this should not be null
				if sm.subscriptions[subscriptionID].Sent[rootID] != nil {
					// Sent[rootID] is a pointer to a slice, so we need to dereference it first
					eventSlice := append(*sm.subscriptions[subscriptionID].Sent[rootID], event)
					sm.subscriptions[subscriptionID].Sent[rootID] = &eventSlice
				}
				sm.mutex.Unlock()
			} else {
				// Convert parsed events for callback
				pack, err := msgpack.Marshal(sm.subscriptions[subscriptionID].Sent[event.ID])
				if err != nil {
					println("Error marshaling event:", err.Error())
					return
				}
				// Create a JavaScript Uint8Array to hold the MessagePack data
				uint8Array := js.Global().Get("Uint8Array").New(len(pack))

				// Copy the Go bytes to the JavaScript Uint8Array
				js.CopyBytesToJS(uint8Array, pack)

				// Call the callback with the event (same format as subscription events)
				callback.Invoke("CACHED_EVENTS", uint8Array)
			}
		}
	}
}

// Recursively handles a set of subscription requests.
// It recursively processes subscriptions at different depths. Depending on the requests returned
// by the different event parsing
// At depth 0, subscriptions remain open for real-time updates.
// At greater depths, subscriptions close after EOSE.
func (sm *SubscriptionManager) ProcessSubscriptionRequests(
	subscriptionID string,
	ctx context.Context,
	pool *nostr.SimplePool,
	requests []types.Request,
	callback js.Func,
	depth int,
	root ...string) {
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

	// Log the original and optimized request counts
	println(fmt.Sprintf("Original requests: %d, Optimized requests: %d", len(requests), len(optimizedRequests)))
	totalFilters := 0
	totalRelays := 0
	for _, req := range optimizedRequests {
		totalFilters += len(req.Filters)
		totalRelays += len(req.Relays)
	}
	println(fmt.Sprintf("Total filters after optimization: %d and relays: %d", totalFilters, totalRelays))

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
				println(fmt.Sprintf("Creating subscription for relays: %v and filter: %+v", relays, filter))
				if len(relays) != 1 {
					return
				}
				// Subscribe to events
				sub := pool.SubscribeManyNotifyEOSE(subCtx, relays, filter, eoseChan)

				// Process events as they arrive
				go func() {
					for {
						select {
						case <-subCtx.Done():
							return
						case ev, ok := <-sub:
							println(fmt.Sprintf("new event received with filter: %+v", filter))
							if !ok {
								// Channel was closed, exit goroutine
								println("Subscription channel closed, exiting event processing goroutine")
								return
							}
							rootID := ev.Event.ID
							if len(root) > 0 {
								rootID = root[0]
							}
							// check before parsing if the event has already been sent
							// it's also a good way to avoid double parsing,
							// since that event would have been sent by the cache already
							// only check at depth 0
							if depth == 0 {
								sm.mutex.Lock()
								// check before parsing event if it has already been treated
								if sm.subscriptions[subscriptionID].Sent[rootID] != nil {
									sm.mutex.Unlock()
									continue
								}
								sm.subscriptions[subscriptionID].Sent[rootID] = &[]types.ParsedEvent{types.ParsedEvent{Event: *ev.Event}}
								sm.mutex.Unlock()
							}

							// Process the event
							parsedEvent, err := sm.parser.Parse(*ev.Event)
							if err != nil {
								println("Error parsing event:", err.Error())
								continue
							}

							// Add to in-memory database
							sm.database.AddEvent(parsedEvent)
							sm.stagedEvents = append(sm.stagedEvents, parsedEvent)

							var newRequests []types.Request = []types.Request{}

							if parsedEvent.Requests != nil && len(*parsedEvent.Requests) > 0 {
								// loop over the requests, and keep only those that return no result from the cache
								for _, request := range *parsedEvent.Requests {
									events, _ := sm.database.QueryEvents(request.ToFilter())
									if len(events) > 0 {
										eventSlice := append(*sm.subscriptions[subscriptionID].Sent[rootID], events...)
										sm.subscriptions[subscriptionID].Sent[rootID] = &eventSlice
										if depth == 1 {
											// loop one more time
										}
									} else {
										newRequests = append(newRequests, request)
									}
								}
							}

							// Excerpt from: func (sm *SubscriptionManager) ProcessSubscriptionRequests
							// First process any new requests that came from parsing this event
							if len(newRequests) > 0 {
								// Process new requests synchronously before continuing
								sm.ProcessSubscriptionRequests(subscriptionID, ctx, pool, newRequests, callback, depth+1, rootID)
							}

							if len(root) > 0 {
								sm.mutex.Lock()
								// Sent[root[0]] is a pointer to a slice, so we need to dereference it first
								eventSlice := append(*sm.subscriptions[subscriptionID].Sent[rootID], parsedEvent)
								sm.subscriptions[subscriptionID].Sent[rootID] = &eventSlice
								sm.mutex.Unlock()
							} else {
								// modify index 0 in the sent slice
								sm.mutex.Lock()
								(*sm.subscriptions[subscriptionID].Sent[parsedEvent.ID])[0] = parsedEvent
								sm.mutex.Unlock()
								// Convert to JSON for callback
								pack, err := msgpack.Marshal(sm.subscriptions[subscriptionID].Sent[parsedEvent.ID])
								if err != nil {
									println("Error marshaling event:", err.Error())
									continue
								}
								// Create a JavaScript Uint8Array to hold the MessagePack data
								uint8Array := js.Global().Get("Uint8Array").New(len(pack))

								// Copy the Go bytes to the JavaScript Uint8Array
								js.CopyBytesToJS(uint8Array, pack)

								// Only call the callback after all related requests are processed
								callback.Invoke("FETCHED_EVENTS", uint8Array)
							}

						}
						// Wait for EOSE
						<-eoseChan

						// Notify callback about EOSE
						relaysPack, err := msgpack.Marshal(relays)
						if err != nil {
							println("Error marshaling EOSE event:", err.Error())
							return
						}
						// Create a JavaScript Uint8Array to hold the MessagePack data
						uint8Array := js.Global().Get("Uint8Array").New(len(relaysPack))

						// Copy the Go bytes to the JavaScript Uint8Array
						js.CopyBytesToJS(uint8Array, relaysPack)

						callback.Invoke("EOSE", uint8Array)

						// For depth > 0, close the subscription after EOSE
						// For depth 0, keep the subscription open for real-time updates
						if depth > 0 {
							cancelSub()
							println("Closed subscription at depth", depth, "after EOSE")
							return
						} else {
							println("Keeping subscription open at depth 0 for real-time updates")
						}

					}

				}()

			}(relays, filter)
		}
	}

	// For non-zero depths, wait for all subscriptions to complete
	// For depth 0, we return immediately while subscriptions stay alive
	if depth > 0 {
		wg.Wait()
	}
}

// GetActiveSubscriptionCount returns the number of active subscriptions
func (sm *SubscriptionManager) GetActiveSubscriptionCount() int {
	if sm == nil {
		return 0
	}
	sm.mutex.Lock()
	defer sm.mutex.Unlock()
	return len(sm.subscriptions)
}
