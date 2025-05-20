//go:build js && wasm
// +build js,wasm

package network

import (
	"context"
	"fmt"
	"sync"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/nostr/db"
	"github.com/candypoets/nutscash/nostr/logger"
	"github.com/candypoets/nutscash/nostr/parser"
	"github.com/candypoets/nutscash/nostr/relays"
	"github.com/nbd-wtf/go-nostr"
	"github.com/rs/zerolog"
	"github.com/vmihailenco/msgpack/v5"
)

// PublishStatus represents the status of a publish operation to a relay
type PublishStatus string

const (
	StatusPending   PublishStatus = "pending"
	StatusSent      PublishStatus = "sent"
	StatusSuccess   PublishStatus = "success"
	StatusFailed    PublishStatus = "failed"
	StatusRejected  PublishStatus = "rejected"
	StatusConnError PublishStatus = "connection_error"
)

// RelayStatusUpdate represents an update about the status of publishing to a relay
type RelayStatusUpdate struct {
	Relay     string        `json:"relay" msgpack:"relay"`
	Status    PublishStatus `json:"status" msgpack:"status"`
	Message   string        `json:"message" msgpack:"message"`
	Timestamp int64         `json:"timestamp" msgpack:"timestamp"`
}

// PublishOperation tracks a publish operation
type PublishOperation struct {
	Event       nostr.Event
	RelayStatus map[string]PublishStatus
	StartTime   time.Time
	Context     context.Context
	Cancel      context.CancelFunc
}

// Create final summary
// Define a proper struct instead of using a map
type PublishSummary struct {
	RelayCount    int                      `json:"relayCount" msgpack:"relayCount"`
	SuccessCount  int                      `json:"successCount" msgpack:"successCount"`
	RelayStatuses map[string]PublishStatus `json:"relayStatuses" msgpack:"relayStatuses"`
	DurationMs    int64                    `json:"durationMs" msgpack:"durationMs"`
	Timestamp     int64                    `json:"timestamp" msgpack:"timestamp"`
}

// PublishManager handles publishing events to relays
type PublishManager struct {
	database     *db.NostrDB
	parser       *parser.Parser
	mutex        sync.Mutex
	operations   map[string]*PublishOperation
	relayManager *relays.RelayConnectionManager
	log          zerolog.Logger
	callback     js.Func
	indexRelays  []string
}

var pm = &PublishManager{}

// NewPublishManager creates a new publish manager
func NewPublishManager(database *db.NostrDB, parser *parser.Parser, relayManager *relays.RelayConnectionManager) *PublishManager {
	componentLogger := logger.WithComponent("publish")

	callback := js.FuncOf(func(this js.Value, args []js.Value) any {
		// args[0] = event type
		// args[1] = event data
		eventData := map[string]any{
			"type":      args[0].String(),
			"publishId": args[1].String(),
		}

		// Add event data if available
		if len(args) >= 3 {
			eventData["eventData"] = args[2]
		}

		// Post message back to JavaScript
		js.Global().Get("self").Call("postMessage", eventData)
		return nil
	})

	indexRelays := []string{"wss://purplepag.es", "wss://nos.lol", "wss://nostr.wine", "wss://relay.nostr.band"}

	pm := &PublishManager{
		operations:   make(map[string]*PublishOperation),
		relayManager: relayManager,
		database:     database,
		parser:       parser,
		log:          componentLogger,
		callback:     callback,
		indexRelays:  indexRelays,
	}

	js.Global().Set("publishEvent", js.FuncOf(pm.jsPublishEvent))

	return pm
}

func (pm *PublishManager) jsPublishEvent(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.Error{Value: js.ValueOf("Not enough arguments")}
	}

	publishID := args[0].String()
	binaryData := args[1]

	// Convert JS Uint8Array to Go []byte
	length := binaryData.Length()
	goBytes := make([]byte, length)
	js.CopyBytesToGo(goBytes, binaryData)

	// Deserialize the binary data
	var event nostr.Event
	if err := msgpack.Unmarshal(goBytes, &event); err != nil {
		return js.Error{Value: js.ValueOf("Failed to parse binary data: " + err.Error())}
	}

	// Publish the event using the manager
	go pm.PublishEvent(publishID, event)

	return nil
}

// PublishEvent initiates the process of publishing an event
func (pm *PublishManager) PublishEvent(publishId string, event nostr.Event) error {
	pm.log.Info().
		Str("publish_id", publishId).
		Int("kind", event.Kind).
		Str("pubkey", event.PubKey).
		Msg("Publishing event")
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	err := pm.parser.Prepare(&event)

	if err != nil {
		pm.log.Error().
			Str("publish_id", publishId).
			Err(err).
			Msg("Failed to prepare event")
		return fmt.Errorf("failed to prepare event: %w", err)
	}

	// Check if we already have an operation with this ID
	if _, exists := pm.operations[publishId]; exists {
		return fmt.Errorf("publish operation with ID %s already exists", publishId)
	}

	// Create timeout context
	ctx, cancel := context.WithCancel(context.Background())

	// Determine target relays for the event
	relays, err := pm.determineTargetRelays(ctx, event)
	if err != nil {
		pm.log.Warn().
			Str("publishID", publishId).
			Err(err).
			Msg("Failed to determine target relays, canceling operation")
		cancel()
		return fmt.Errorf("failed to determine target relays: %w", err)
	}

	if len(relays) == 0 {
		pm.log.Debug().
			Str("publishID", publishId).
			Msg("No specific relays determined, falling back to default relays")
		// Fall back to default relays if no specific ones were determined
		relays = pm.indexRelays
	}

	// Log which relays will be used for this publish operation
	pm.log.Debug().
		Str("publishID", publishId).
		Strs("relays", relays).
		Msg("Selected relays for publishing")

	// Initialize the operation
	operation := &PublishOperation{
		Event:       event,
		RelayStatus: make(map[string]PublishStatus),
		StartTime:   time.Now(),
		Context:     ctx,
		Cancel:      cancel,
	}

	// Initialize status for each relay
	for _, relay := range relays {
		operation.RelayStatus[relay] = StatusPending
	}

	// Store the operation
	pm.operations[publishId] = operation

	// Start publishing to each relay in separate goroutines
	for _, relay := range relays {
		go pm.publishToRelay(publishId, relay, event, ctx)
	}

	return nil
}

// determineTargetRelays determines which relays an event should be published to
func (pm *PublishManager) determineTargetRelays(ctx context.Context, event nostr.Event) ([]string, error) {
	// Track unique relays
	relaySet := make(map[string]bool)

	// get all pubkeys for which we need
	writePubkeys := make([]string, 0)
	readPubkeys := make([]string, 0)

	// Always add the event author's pubkey as a write pubkey
	writePubkeys = append(writePubkeys, event.PubKey)

	// Skip extracting mentioned pubkeys for kind 3 (contact list) events
	if event.Kind != 3 && event.Kind < 10000 {
		for _, tag := range event.Tags {
			if len(tag) >= 2 && tag[0] == "p" {
				readPubkeys = append(readPubkeys, tag[1])
			}
		}
	}

	// Get relays for all mentioned pubkeys
	var wg sync.WaitGroup
	relaySetMutex := sync.Mutex{}

	for _, pubkey := range readPubkeys {
		wg.Add(1)
		go func(pk string) {
			defer wg.Done()

			pubkeyRelays, err := pm.findNIP65(ctx, pk)
			if err != nil {
				pm.log.Debug().
					Str("pubkey", pk).
					Err(err).
					Msg("Failed to get relays for mentioned pubkey")
				return
			}

			if pubkeyRelays != nil {
				relaySetMutex.Lock()
				for _, relay := range *pubkeyRelays {
					if relay.Read {
						relaySet[relay.URL] = true
					}
				}
				relaySetMutex.Unlock()
			}
		}(pubkey)
	}

	for _, pubkey := range writePubkeys {
		wg.Add(1)
		go func(pk string) {
			defer wg.Done()

			pubkeyRelays, err := pm.findNIP65(ctx, pk)
			if err != nil {
				pm.log.Debug().
					Str("pubkey", pk).
					Err(err).
					Msg("Failed to get relays for author pubkey")
				return
			}

			if pubkeyRelays != nil {
				relaySetMutex.Lock()
				for _, relay := range *pubkeyRelays {
					if relay.Write {
						relaySet[relay.URL] = true
					}
				}
				relaySetMutex.Unlock()
			}
		}(pubkey)
	}

	// Wait for all goroutines to complete
	wg.Wait()

	// Convert the set to a slice
	relays := make([]string, 0, len(relaySet))
	for relay := range relaySet {
		relays = append(relays, relay)
	}

	return relays, nil
}

func (pm *PublishManager) findNIP65(ctx context.Context, pubkey string) (*parser.Kind10002Parsed, error) {
	pm.log.Debug().
		Str("pubkey", pubkey).
		Msg("Finding NIP-65 relays for pubkey")
	// First check in the database
	filter := nostr.Filter{
		Kinds:   []int{10002}, // NIP-65
		Authors: []string{pubkey},
		Limit:   1,
	}

	// Query the database
	event, ok := pm.database.QueryEvent(filter)
	if ok {
		pm.log.Debug().
			Str("pubkey", pubkey).
			Str("parsed", fmt.Sprintf("%+v", event)).
			Msg("Found potential NIP-65 event(s) in database")

		parsed, err := pm.parser.Parse(event.Event)
		relayList, ok := parsed.Parsed.(*parser.Kind10002Parsed)
		if err != nil || !ok || relayList == nil {
			pm.log.Error().
				Str("pubkey", pubkey).
				Err(err).
				Msg("Failed to parse NIP-65 event")
			return nil, fmt.Errorf("error parsing NIP-65 event: %w", err)
		}

		// Now relayList should contain your properly typed data
		pm.log.Debug().
			Str("pubkey", pubkey).
			Int("relay_count", len(*relayList)).
			Msg("Successfully converted NIP-65 relay list")

		return relayList, nil
	}

	// If not found in database or parsing failed, fetch from network
	pm.log.Debug().
		Str("pubkey", pubkey).
		Strs("relays", pm.indexRelays).
		Msg("No valid NIP-65 event found in database, fetching from network")

	// Create a timeout context for this query
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)

	// Channel to collect events from goroutines
	eventChan := make(chan *nostr.Event, len(pm.indexRelays))

	// WaitGroup to track all goroutines
	var wg sync.WaitGroup

	// Launch a goroutine for each relay
	for _, relayURL := range pm.indexRelays {
		wg.Add(1)
		go func(url string) {
			// Log the start of the subscription
			pm.log.Debug().
				Str("relay", url).
				Str("pubkey", pubkey).
				Msg("Starting subscription to fetch NIP-65 data")
			defer wg.Done()

			// Connect to relay
			relay, err := pm.relayManager.GetRelay(url)
			if err != nil {
				pm.log.Debug().
					Str("relay", url).
					Err(err).
					Msg("Failed to connect to relay")
				return
			}
			defer pm.relayManager.ReleaseRelay(url)

			// Subscribe to the relay
			sub, err := relay.Subscribe(queryCtx, []nostr.Filter{filter})
			if err != nil {
				pm.log.Debug().
					Str("relay", url).
					Err(err).
					Msg("Failed to subscribe to relay")
				return
			}

			// Ensure subscription is closed when done
			defer sub.Unsub()

			// Process events from this relay
			for {
				select {
				case <-queryCtx.Done():
					pm.log.Debug().
						Str("relay", url).
						Msg("Query context done, canceling subscription")
					return
				case ev, ok := <-sub.Events:
					if !ok {
						pm.log.Debug().
							Str("relay", url).
							Msg("Subscription channel closed")
						return
					}
					// Send this event to the collection channel
					select {
					case eventChan <- ev:
						pm.log.Debug().
							Str("relay", url).
							Str("event_id", ev.ID).
							Msg("Received NIP-65 event")
					case <-queryCtx.Done():
						pm.log.Debug().
							Str("relay", url).
							Msg("Operation canceled, stopping event subscription")
						return
					}
				case <-sub.EndOfStoredEvents:
					pm.log.Debug().
						Str("relay", url).
						Msg("Subscription channel closed")
					return
				}
			}
		}(relayURL)
	}

	// Start a goroutine to close the event channel when all relay queries are done
	go func() {
		wg.Wait()
		close(eventChan)
	}()

	// Log that we're ending the query
	pm.log.Debug().
		Str("pubkey", pubkey).
		Msg("Ending NIP-65 relay query")

	// Collect events and find the most recent one
	var latestEvent *nostr.Event
	for ev := range eventChan {
		if latestEvent == nil || ev.CreatedAt > latestEvent.CreatedAt {
			latestEvent = ev
		}
	}
	// cancel the query context, just in case
	cancel()

	if latestEvent == nil {
		pm.log.Error().
			Str("pubkey", pubkey).
			Msg("No NIP-65 events found from network queries")
		return nil, fmt.Errorf("no NIP-65 event found for pubkey %s", pubkey)
	}

	// Parse the event using the parser
	parsedEvent, err := pm.parser.Parse(*latestEvent)
	if err != nil {
		pm.log.Error().
			Str("pubkey", pubkey).
			Err(err).
			Msg("Error parsing NIP-65 event")
		return nil, fmt.Errorf("error parsing NIP-65 event: %w", err)
	}

	pm.database.AddEvent(parsedEvent)

	relayList, ok := parsedEvent.Parsed.(*parser.Kind10002Parsed)
	if ok && relayList != nil {
		pm.log.Debug().
			Str("pubkey", pubkey).
			Int("relays_found", len(*relayList)).
			Msg("Found NIP-65 relay list")
		return relayList, nil
	}
	// Log additional debug information
	pm.log.Debug().
		Str("pubkey", pubkey).
		Msg("Failed to extract relay list from parsed event")
	return nil, fmt.Errorf("no NIP-65 event found for pubkey %s", pubkey)
}

// publishToRelay publishes an event to a specific relay
func (pm *PublishManager) publishToRelay(publishId string, relayURL string, event nostr.Event, ctx context.Context) {
	// Log that we're starting to publish to this relay
	pm.log.Debug().
		Str("publish_id", publishId).
		Str("relay", relayURL).
		Msg("Publishing event to relay")

	// Update status to "sending"
	pm.updateRelayStatus(publishId, relayURL, StatusSent, "Sending event to relay")

	// Get or establish a connection to the relay
	relay, err := pm.relayManager.GetRelay(relayURL)
	if err != nil {
		pm.updateRelayStatus(publishId, relayURL, StatusConnError, fmt.Sprintf("Failed to connect: %v", err))
		return
	}

	defer pm.relayManager.ReleaseRelay(relayURL)

	// Publish the event
	publishCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	err = relay.Publish(publishCtx, event)
	if err != nil {
		pm.updateRelayStatus(publishId, relayURL, StatusFailed, fmt.Sprintf("Publish error: %v", err))
		return
	}

	// Update status based on relay response
	pm.updateRelayStatus(publishId, relayURL, StatusSuccess, "Event published successfully")
}

// updateRelayStatus updates the status of a relay for a publish operation
func (pm *PublishManager) updateRelayStatus(publishID string, relayURL string, status PublishStatus, message string) {
	pm.mutex.Lock()

	// Check if the operation exists
	operation, exists := pm.operations[publishID]
	if !exists {
		pm.mutex.Unlock()
		pm.log.Warn().
			Str("publish_id", publishID).
			Str("relay", relayURL).
			Msg("Tried to update status for non-existent publish operation")
		return
	}

	// Update the status
	operation.RelayStatus[relayURL] = status

	pm.mutex.Unlock()

	// Create status update
	update := RelayStatusUpdate{
		Relay:     relayURL,
		Status:    status,
		Message:   message,
		Timestamp: time.Now().Unix(),
	}

	// Serialize the update
	data, err := msgpack.Marshal(update)
	if err != nil {
		pm.log.Error().
			Err(err).
			Str("publish_id", publishID).
			Str("relay", relayURL).
			Msg("Failed to marshal status update")
		return
	}

	// Create a JavaScript Uint8Array to hold the MessagePack data
	uint8Array := js.Global().Get("Uint8Array").New(len(data))
	js.CopyBytesToJS(uint8Array, data)

	// Notify via callback
	pm.callback.Invoke("PUBLISH_STATUS", publishID, uint8Array)

	// Check if all relays have completed
	allCompleted := pm.checkAllRelaysCompleted(publishID)
	if allCompleted {
		pm.cleanupOperation(publishID)
	}
}

// checkAllRelaysCompleted checks if all relays have completed for a publish operation
func (pm *PublishManager) checkAllRelaysCompleted(publishID string) bool {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	operation, exists := pm.operations[publishID]
	if !exists {
		return true
	}

	for _, status := range operation.RelayStatus {
		if status == StatusPending || status == StatusSent {
			return false
		}
	}

	return true
}

// cleanupOperation finalizes a publish operation
func (pm *PublishManager) cleanupOperation(publishID string) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	// operation, exists := pm.operations[publishID]
	// if !exists {
	// 	return
	// }

	// Create the summary using the struct
	// summary := PublishSummary{
	// 	RelayCount:    len(operation.RelayStatus),
	// 	SuccessCount:  0,
	// 	RelayStatuses: operation.RelayStatus,
	// 	DurationMs:    time.Since(operation.StartTime).Milliseconds(),
	// 	Timestamp:     time.Now().Unix(),
	// }

	// // Count successes
	// for _, status := range operation.RelayStatus {
	// 	if status == StatusSuccess {
	// 		summary.SuccessCount++
	// 	}
	// }

	// // Serialize the summary
	// data, err := msgpack.Marshal(summary)
	// if err != nil {
	// 	pm.log.Error().
	// 		Err(err).
	// 		Str("publish_id", publishID).
	// 		Msg("Failed to marshal publish summary")
	// } else {
	// 	// Create a JavaScript Uint8Array to hold the MessagePack data
	// 	uint8Array := js.Global().Get("Uint8Array").New(len(data))
	// 	js.CopyBytesToJS(uint8Array, data)

	// 	// Send the complete notification
	// 	pm.callback.Invoke("PUBLISH_COMPLETE", publishID, uint8Array)
	// }

	// Delete the operation
	delete(pm.operations, publishID)
}

// GetActivePublishCount returns the number of active publish operations
func (pm *PublishManager) GetActivePublishCount() int {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()
	return len(pm.operations)
}
