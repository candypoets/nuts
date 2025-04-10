//go:build js && wasm
// +build js,wasm

package network

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/db"
	"github.com/candypoets/nutscash/logger"
	"github.com/candypoets/nutscash/parser"
	"github.com/candypoets/nutscash/signer"
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
	Signer        signer.Signer
	database      *db.NostrDB
	parser        *parser.Parser
	mutex         sync.Mutex
	operations    map[string]*PublishOperation
	relayManager  *RelayConnectionManager
	log           zerolog.Logger
	callback      js.Func
	defaultRelays []string
}

// NewPublishManager creates a new publish manager
func NewPublishManager(database *db.NostrDB, relayManager *RelayConnectionManager, callback js.Func, defaultRelays []string) *PublishManager {
	componentLogger := logger.WithComponent("publish")

	return &PublishManager{
		operations:    make(map[string]*PublishOperation),
		relayManager:  relayManager,
		database:      database,
		log:           componentLogger,
		callback:      callback,
		defaultRelays: defaultRelays,
	}
}

// PublishEvent initiates the process of publishing an event
func (pm *PublishManager) PublishEvent(event nostr.Event) error {
	pm.log.Info().
		Str("event_id", event.ID).
		Int("kind", event.Kind).
		Str("pubkey", event.PubKey).
		Msg("Publishing event")
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	// Check if we already have an operation with this ID
	if _, exists := pm.operations[event.ID]; exists {
		return fmt.Errorf("publish operation with ID %s already exists", event.ID)
	}

	// Create timeout context
	ctx, cancel := context.WithCancel(context.Background())

	// Determine target relays for the event
	relays, err := pm.determineTargetRelays(ctx, event)
	if err != nil {
		pm.log.Warn().
			Str("event_id", event.ID).
			Err(err).
			Msg("Failed to determine target relays, canceling operation")
		cancel()
		return fmt.Errorf("failed to determine target relays: %w", err)
	}

	if len(relays) == 0 {
		pm.log.Debug().
			Str("event_id", event.ID).
			Msg("No specific relays determined, falling back to default relays")
		// Fall back to default relays if no specific ones were determined
		relays = pm.defaultRelays
	}

	// Log which relays will be used for this publish operation
	pm.log.Debug().
		Str("event_id", event.ID).
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
	pm.operations[event.ID] = operation

	// Start publishing to each relay in separate goroutines
	for _, relay := range relays {
		go pm.publishToRelay(relay, event, ctx)
	}

	return nil
}

// determineTargetRelays determines which relays an event should be published to
func (pm *PublishManager) determineTargetRelays(ctx context.Context, event nostr.Event) ([]string, error) {
	// Track unique relays
	relaySet := make(map[string]bool)

	// Add author's write relays from NIP-65
	authorRelays, err := pm.findNIP65(ctx, event.PubKey)
	if err != nil {
		pm.log.Warn().
			Str("pubkey", event.PubKey).
			Err(err).
			Msg("Failed to get author's write relays")
	}
	if authorRelays != nil {
		for _, relay := range *authorRelays {
			if relay.Write {
				relaySet[relay.URL] = true
			}
		}
	}

	// Extract all mentioned pubkeys from event tags
	mentionedPubkeys := make([]string, 0)

	// Skip extracting mentioned pubkeys for kind 3 (contact list) events
	if event.Kind != 3 && event.Kind < 10000 {
		for _, tag := range event.Tags {
			if len(tag) >= 2 && tag[0] == "p" {
				mentionedPubkeys = append(mentionedPubkeys, tag[1])
			}
		}
	}

	// Get relays for all mentioned pubkeys
	for _, pubkey := range mentionedPubkeys {
		// Skip if it's the author's pubkey (already processed)
		if pubkey == event.PubKey {
			continue
		}

		pubkeyRelays, err := pm.findNIP65(ctx, pubkey)
		if err != nil {
			pm.log.Debug().
				Str("pubkey", pubkey).
				Err(err).
				Msg("Failed to get relays for mentioned pubkey")
			continue
		}

		if pubkeyRelays != nil {
			for _, relay := range *pubkeyRelays {
				if relay.Read {
					relaySet[relay.URL] = true
				}
			}
		}
	}

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
	events, err := pm.database.QueryEvents(filter)
	if err == nil && len(events) > 0 {
		pm.log.Debug().
			Str("pubkey", pubkey).
			Int("count", len(events)).
			Msg("Found potential NIP-65 event(s) in database")
		// Check if the event has been parsed already
		jsonData, err := json.Marshal(events[0].Parsed)
		if err != nil {
			pm.log.Error().Err(err).Msg("Failed to marshal parsed data to JSON")
			return nil, err
		}

		// Then unmarshal it into a Kind10002Parsed slice
		var relayList parser.Kind10002Parsed
		if err := json.Unmarshal(jsonData, &relayList); err != nil {
			pm.log.Error().Err(err).Msg("Failed to unmarshal JSON to Kind10002Parsed")
			return nil, err
		}

		// Now relayList should contain your properly typed data
		pm.log.Debug().
			Str("pubkey", pubkey).
			Int("relay_count", len(relayList)).
			Interface("relay_list", relayList).
			Msg("Successfully converted NIP-65 relay list")

		return &relayList, nil
	}

	// Use default relays to fetch the metadata
	relaysToQuery := pm.defaultRelays
	// If not found in database or parsing failed, fetch from network
	pm.log.Debug().
		Str("pubkey", pubkey).
		Strs("relays", relaysToQuery).
		Msg("No valid NIP-65 event found in database, fetching from network")

	// Create a timeout context for this query
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)

	// Channel to collect events from goroutines
	eventChan := make(chan *nostr.Event, len(relaysToQuery))

	// WaitGroup to track all goroutines
	var wg sync.WaitGroup

	// Launch a goroutine for each relay
	for _, relayURL := range relaysToQuery {
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

	relayList, ok := events[0].Parsed.(*parser.Kind10002Parsed)
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
func (pm *PublishManager) publishToRelay(relayURL string, event nostr.Event, ctx context.Context) {
	// Log that we're starting to publish to this relay
	pm.log.Debug().
		Str("event_id", event.ID).
		Str("relay", relayURL).
		Msg("Publishing event to relay")

	// Update status to "sending"
	pm.updateRelayStatus(event.ID, relayURL, StatusSent, "Sending event to relay")

	// Get or establish a connection to the relay
	relay, err := pm.relayManager.GetRelay(relayURL)
	if err != nil {
		pm.updateRelayStatus(event.ID, relayURL, StatusConnError, fmt.Sprintf("Failed to connect: %v", err))
		return
	}

	defer pm.relayManager.ReleaseRelay(relayURL)

	// Publish the event
	publishCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	err = relay.Publish(publishCtx, event)
	if err != nil {
		pm.updateRelayStatus(event.ID, relayURL, StatusFailed, fmt.Sprintf("Publish error: %v", err))
		return
	}

	// Update status based on relay response
	pm.updateRelayStatus(event.ID, relayURL, StatusSuccess, "Event published successfully")
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
