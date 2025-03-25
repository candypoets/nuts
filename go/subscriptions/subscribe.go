//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/db"
	"github.com/candypoets/nutscash/logger"
	"github.com/candypoets/nutscash/parser"
	"github.com/candypoets/nutscash/types"
	"github.com/rs/zerolog"

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
	relays        map[string]*nostr.Relay
	subs          map[string]int
	log           zerolog.Logger
}

// NewSubscriptionManager creates a new subscription manager
func NewSubscriptionManager(database *db.NostrDB, parser *parser.Parser) *SubscriptionManager {
	// Get a contextualized logger
	componentLogger := logger.WithComponent("subscriptions")

	sm := &SubscriptionManager{
		subscriptions: make(map[string]*Subscription),
		database:      database,
		parser:        parser,
		stagedEvents:  []types.ParsedEvent{},
		relays:        make(map[string]*nostr.Relay),
		subs:          make(map[string]int),
		log:           componentLogger,
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
func (sm *SubscriptionManager) OpenSubscription(subscriptionID string, requests []types.Request, callback js.Func) error {
	sm.log.Info().
		Str("subscription_id", subscriptionID).
		Int("request_count", len(requests)).
		Msg("Opening subscription")
	if sm.subscriptions[subscriptionID] != nil {
		sm.CloseSubscription(subscriptionID)
	}

	// Create a new pool for this subscription
	ctx, cancel := context.WithCancel(context.Background())

	// Create subscription record
	subscription := &Subscription{
		ID:         subscriptionID,
		Ctx:        ctx,
		Sent:       make(map[string]*[]types.ParsedEvent),
		CancelFunc: cancel,
	}

	sm.mutex.Lock()
	sm.subscriptions[subscriptionID] = subscription
	sm.mutex.Unlock()

	go func() {
		networkRequests := sm.ProcessLocalRequests(subscriptionID, ctx, requests, callback, 0)
		if ctx.Err() != nil {
			return
		}
		if len(networkRequests) == 0 {
			return
		}
		sm.ProcessSubscriptionRequests(subscriptionID, ctx, networkRequests, callback)
	}()
	sm.log.Info().
		Str("subscription_id", subscriptionID).
		Int("request_count", len(requests)).
		Msg("Opened subscription successfully")
	return nil
}

// CloseSubscription closes a subscription by ID
func (sm *SubscriptionManager) CloseSubscription(subscriptionID string) {
	sm.log.Info().
		Str("subscription_id", subscriptionID).
		Int("goroutines", runtime.NumGoroutine()).
		Msg("Closing subscription")
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	if sub, exists := sm.subscriptions[subscriptionID]; exists {
		// Cancel the context to close all subscriptions
		sub.CancelFunc()
		delete(sm.subscriptions, subscriptionID)
	}
	sm.log.Info().
		Str("subscription_id", subscriptionID).
		Int("goroutines", runtime.NumGoroutine()).
		Msg("Closed subscription")
}

// ProcessLocalRequests searches for events in the database based on requests,
// processes them, and recursively handles any resulting requests up to a maximum depth of 3.
func (sm *SubscriptionManager) ProcessLocalRequests(
	subscriptionID string,
	ctx context.Context,
	requests []types.Request,
	callback js.Func,
	depth int,
	root ...string) []types.Request {
	// Check recursion depth limit
	if depth >= 2 {
		sm.log.Debug().Msg("Reached maximum recursion depth (2) for local requests")
		return make([]types.Request, 0)
	}
	filteredRequests, events, err := sm.database.QueryEventsForRequests(requests, depth > 0)
	if err != nil {
		sm.log.Warn().Msg(fmt.Sprintf("Error querying database: %v", err))
		return filteredRequests
	}

	// mark all cached events as sent, to avoid refetching from the network later in the same sub id
	if depth == 0 {
		sm.mutex.Lock()
		for _, event := range events {
			sm.subscriptions[subscriptionID].Sent[event.ID] = &[]types.ParsedEvent{event}
		}
		sm.mutex.Unlock()
	}
	// set an hardcoded limit to the number of events to process
	if len(events) > 100 {
		events = events[:100]
	}

	if ctx.Err() != nil {
		return filteredRequests
	}

	// Process each event found
	for _, event := range events {
		if ctx.Err() != nil {
			return filteredRequests
		}
		rootID := event.ID
		if len(root) > 0 {
			rootID = root[0]
		}
		// only on depth 0 do we check if the event has already been sent

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
				sm.log.Warn().Msg(fmt.Sprintf("Error parsing event from database: %v", err))
				continue
			}
		}

		// If we have new requests from parsing this event,
		// process them recursively, but with incremented depth
		if event.Requests != nil && len(*event.Requests) > 0 {
			// Process recursively with increased depth
			sm.ProcessLocalRequests(subscriptionID, ctx, *event.Requests, callback, depth+1, rootID)
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
			if ctx.Err() != nil {
				return filteredRequests
			}
			// Convert parsed events for callback
			pack, err := msgpack.Marshal(sm.subscriptions[subscriptionID].Sent[rootID])
			if err != nil {
				sm.log.Error().Err(err).Msg("Error marshaling event")
				continue
			}
			// Create a JavaScript Uint8Array to hold the MessagePack data
			uint8Array := js.Global().Get("Uint8Array").New(len(pack))

			// Copy the Go bytes to the JavaScript Uint8Array
			js.CopyBytesToJS(uint8Array, pack)

			// Call the callback with the event (same format as subscription events)
			callback.Invoke("CACHED_EVENTS", uint8Array)
		}
	}
	callback.Invoke("EOCE")
	return filteredRequests
}

// Recursively handles a set of subscription requests.
// It recursively processes subscriptions at different depths. Depending on the requests returned
// by the different event parsing
// At depth 0, subscriptions remain open for real-time updates.
// At greater depths, subscriptions close after EOSE.
func (sm *SubscriptionManager) ProcessSubscriptionRequests(
	subscriptionID string,
	ctx context.Context,
	requests []types.Request,
	callback js.Func) {
	sm.log.Debug().
		Str("subscription_id", subscriptionID).
		Int("request_count", len(requests)).
		Int("goroutines", runtime.NumGoroutine()).
		Msg("Processing subscription requests")

	if requests == nil {
		return
	}

	var wg sync.WaitGroup

	// Optimize subscription requests
	optimizedRequests := OptimizeSubscriptions(requests)

	for _, req := range optimizedRequests {
		relays := req.Relays
		filters := req.Filters

		if len(relays) == 0 {
			continue
		}

		for _, r := range relays {
			wg.Add(1)
			// Create a subscription context that can be cancelled

			go func(relay string) {
				subCtx, _ := context.WithCancel(ctx)
				defer wg.Done()

				if sm.relays[relay] == nil {
					relayCtx := context.Background()
					sm.relays[relay] = nostr.NewRelay(relayCtx, relay)
					sm.relays[relay].Connect(relayCtx)
				}

				sub, err := sm.relays[relay].Subscribe(subCtx, filters)
				if err != nil {
					sm.log.Error().
						Str("relay", relay).
						Str("subscription_id", subscriptionID).
						Err(err).
						Msg("Error subscribing to relay")
					return
				}
				sm.subs[relay]++

				innerDone := make(chan struct{})

				go func() {
					defer close(innerDone) // Signal completion

					for {
						select {
						case <-subCtx.Done():
							sm.log.Debug().
								Str("subscription_id", subscriptionID).
								Msg("Subscription context cancelled")
							// sub.Unsub()
							// rl.Close()
							return
						case ev, more := <-sub.Events:
							if !more {
								sm.log.Debug().
									Str("subscription_id", subscriptionID).
									Msg("Subscription closed")
								return
							}
							sm.log.Debug().
								Str("event_id", ev.ID).
								Int("kind", ev.Kind).
								Str("subscription_id", subscriptionID).
								Msg("New event received")
							// check before parsing if the event has already been sent
							// it's also a good way to avoid double parsing,
							// since that event would have been sent by the cache already
							// only check at depth 0
							sm.mutex.Lock()
							// check before parsing event if it has already been treated
							if sm.subscriptions[subscriptionID].Sent[ev.ID] != nil {
								sm.mutex.Unlock()
								continue
							}
							sm.subscriptions[subscriptionID].Sent[ev.ID] = &[]types.ParsedEvent{types.ParsedEvent{Event: *ev}}
							sm.mutex.Unlock()

							// Process the event
							parsedEvent, err := sm.parser.Parse(*ev)
							if err != nil {
								sm.log.Error().
									Str("subscription_id", subscriptionID).
									Err(err).
									Msg("Error parsing event")
								continue
							}

							// Add to in-memory database
							sm.database.AddEvent(parsedEvent)
							sm.stagedEvents = append(sm.stagedEvents, parsedEvent)

							// try to build the best context from the cache
							sm.findContext(subscriptionID, parsedEvent)
							// modify index 0 in the sent slice
							sm.mutex.Lock()
							if sm.subscriptions[subscriptionID] != nil {
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

						case <-sub.EndOfStoredEvents:
							// Notify callback about EOSE
							relaysPack, err := msgpack.Marshal(relays)
							if err != nil {
								sm.log.Error().
									Err(err).
									Str("subscription_id", subscriptionID).
									Msg("Error marshaling EOSE event")
								return
							}
							// Create a JavaScript Uint8Array to hold the MessagePack data
							uint8Array := js.Global().Get("Uint8Array").New(len(relaysPack))

							// Copy the Go bytes to the JavaScript Uint8Array
							js.CopyBytesToJS(uint8Array, relaysPack)

							callback.Invoke("EOSE", uint8Array)

							sm.log.Debug().
								Str("subscription_id", subscriptionID).
								Int("goroutines", runtime.NumGoroutine()).
								Msg("Keeping subscription open for real-time updates")
						}
					}
				}()
				select {
				case <-subCtx.Done():
					// Context was cancelled
					// The sub should now be closed
					sub.Unsub()
					// decrement the subscription count
					sm.subs[relay]--
					// if there is no sub to this relay close it
					if sm.subs[relay] == 0 {
						sm.relays[relay].Close()
						sm.relays[relay] = nil
					}
					sm.log.Debug().
						Str("subscription_id", subscriptionID).
						Msg("Outer goroutine ending due to context cancellation")
					return
				case <-innerDone:
					// Inner goroutine completed on its own
					// The sub should now be closed
					sub.Unsub()
					// decrement the subscription count
					sm.subs[relay]--
					// if there is no sub to this relay close it
					if sm.subs[relay] == 0 {
						sm.relays[relay].Close()
						sm.relays[relay] = nil
					}
					sm.log.Debug().
						Str("subscription_id", subscriptionID).
						Msg("Outer goroutine ending because inner goroutine finished")
					return
				}
			}(r)
		}
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

// findContext will use the cache to find the event context with a depth up to 2
func (sm *SubscriptionManager) findContext(subscriptionID string, parsedEvent types.ParsedEvent) {
	var findSubContext func(subEvent types.ParsedEvent, depth int)
	findSubContext = func(subEvent types.ParsedEvent, depth int) {
		if depth > 2 {
			return
		}
		if subEvent.Requests != nil && len(*subEvent.Requests) > 0 {
			// loop over the requests, and keep only those that return no result from the cache
			for _, request := range *subEvent.Requests {
				events, _ := sm.database.QueryEvents(request.ToFilter())
				if len(events) > 0 {
					eventSlice := append(*sm.subscriptions[subscriptionID].Sent[parsedEvent.ID], events...)
					sm.subscriptions[subscriptionID].Sent[parsedEvent.ID] = &eventSlice
					// Loop through all events
					for _, event := range events {
						findSubContext(event, depth+1)
					}
				}
			}
		}
	}
	findSubContext(parsedEvent, 0)
}
