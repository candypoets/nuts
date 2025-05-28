//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"sync"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/rs/zerolog"
)

// javaScriptBridge implements the JavaScriptBridge interface
type javaScriptBridge struct {
	callback js.Func
	mutex    sync.Mutex
}

// NewJavaScriptBridge creates a new JavaScript bridge
func NewJavaScriptBridge() JavaScriptBridge {
	callback := js.FuncOf(func(this js.Value, args []js.Value) any {
		// args[0] = event type
		// args[1] = subscription ID
		// args[2] = event data (optional)
		eventData := map[string]any{
			"type":           args[0].String(),
			"subscriptionId": args[1].String(),
		}

		// Add event data if available
		if len(args) >= 3 {
			eventData["eventData"] = args[2]
		}

		// Post message back to JavaScript
		js.Global().Get("self").Call("postMessage", eventData)
		return nil
	})

	return &javaScriptBridge{
		callback: callback,
	}
}

// PostMessage sends a message to JavaScript
func (jsb *javaScriptBridge) PostMessage(eventType, subscriptionID string, data js.Value) {
	jsb.mutex.Lock()
	defer jsb.mutex.Unlock()

	if data.IsNull() || data.IsUndefined() {
		jsb.callback.Invoke(eventType, subscriptionID)
	} else {
		jsb.callback.Invoke(eventType, subscriptionID, data)
	}
}

// RegisterFunction registers a JavaScript function
func (jsb *javaScriptBridge) RegisterFunction(name string, fn js.Func) {
	js.Global().Set(name, fn)
}

// Close cleans up the bridge resources
func (jsb *javaScriptBridge) Close() {
	jsb.callback.Release()
}

// eventStagingManager implements the EventStagingManager interface
type eventStagingManager struct {
	database        EventDatabase
	logger          zerolog.Logger
	stagedEvents    []types.ParsedEvent
	mutex           sync.Mutex
	stagingInterval time.Duration
	batchSize       int
}

// NewEventStagingManager creates a new event staging manager
func NewEventStagingManager(database EventDatabase, logger zerolog.Logger, stagingInterval time.Duration) EventStagingManager {
	return &eventStagingManager{
		database:        database,
		logger:          logger,
		stagedEvents:    make([]types.ParsedEvent, 0),
		stagingInterval: stagingInterval,
		batchSize:       100, // Default batch size
		mutex:           sync.Mutex{},
	}
}

// StageEvent adds an event to the staging queue
func (esm *eventStagingManager) StageEvent(event types.ParsedEvent) {
	esm.mutex.Lock()
	defer esm.mutex.Unlock()

	esm.stagedEvents = append(esm.stagedEvents, event)

	// If we've reached the batch size, trigger immediate processing
	if len(esm.stagedEvents) >= esm.batchSize {
		go esm.processBatch()
	}
}

// StartStagingProcess starts the background staging process
func (esm *eventStagingManager) StartStagingProcess(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(esm.stagingInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				// Process any remaining events before shutting down
				esm.processBatch()
				return
			case <-ticker.C:
				esm.processBatch()
			}
		}
	}()
}

// processBatch processes the current batch of staged events
func (esm *eventStagingManager) processBatch() {
	esm.mutex.Lock()
	if len(esm.stagedEvents) == 0 {
		esm.mutex.Unlock()
		return
	}

	// Create a copy of staged events and reset the slice
	events := make([]types.ParsedEvent, len(esm.stagedEvents))
	copy(events, esm.stagedEvents)
	esm.stagedEvents = esm.stagedEvents[:0] // Reset slice but keep capacity
	esm.mutex.Unlock()

	// Save events to persistent storage
	esm.logger.Debug().
		Int("event_count", len(events)).
		Msg("Processing staged events batch")

	esm.database.SaveEventsToPersistentStorage(events)

	esm.logger.Debug().
		Int("event_count", len(events)).
		Msg("Staged events batch processed successfully")
}

// GetStagingStats returns statistics about the staging manager
func (esm *eventStagingManager) GetStagingStats() StagingStats {
	esm.mutex.Lock()
	defer esm.mutex.Unlock()

	return StagingStats{
		StagedEventsCount: len(esm.stagedEvents),
		BatchSize:         esm.batchSize,
		StagingInterval:   esm.stagingInterval,
	}
}

// SetBatchSize updates the batch size for staging
func (esm *eventStagingManager) SetBatchSize(size int) {
	esm.mutex.Lock()
	defer esm.mutex.Unlock()

	if size > 0 {
		esm.batchSize = size
	}
}

// Flush immediately processes all staged events
func (esm *eventStagingManager) Flush() {
	esm.processBatch()
}

// StagingStats represents staging manager statistics
type StagingStats struct {
	StagedEventsCount int
	BatchSize         int
	StagingInterval   time.Duration
}

// mockJavaScriptBridge is a mock implementation for testing
type mockJavaScriptBridge struct {
	messages []MockMessage
	mutex    sync.RWMutex
}

// MockMessage represents a message sent to JavaScript
type MockMessage struct {
	EventType      string
	SubscriptionID string
	Data           js.Value
	Timestamp      time.Time
}

// NewMockJavaScriptBridge creates a mock JavaScript bridge for testing
func NewMockJavaScriptBridge() *mockJavaScriptBridge {
	return &mockJavaScriptBridge{
		messages: make([]MockMessage, 0),
	}
}

// PostMessage records the message for testing
func (mjsb *mockJavaScriptBridge) PostMessage(eventType, subscriptionID string, data js.Value) {
	mjsb.mutex.Lock()
	defer mjsb.mutex.Unlock()

	mjsb.messages = append(mjsb.messages, MockMessage{
		EventType:      eventType,
		SubscriptionID: subscriptionID,
		Data:           data,
		Timestamp:      time.Now(),
	})
}

// RegisterFunction is a no-op for mock
func (mjsb *mockJavaScriptBridge) RegisterFunction(name string, fn js.Func) {
	// No-op for testing
}

// GetMessages returns all recorded messages
func (mjsb *mockJavaScriptBridge) GetMessages() []MockMessage {
	mjsb.mutex.RLock()
	defer mjsb.mutex.RUnlock()

	result := make([]MockMessage, len(mjsb.messages))
	copy(result, mjsb.messages)
	return result
}

// GetMessageCount returns the number of messages sent
func (mjsb *mockJavaScriptBridge) GetMessageCount() int {
	mjsb.mutex.RLock()
	defer mjsb.mutex.RUnlock()
	return len(mjsb.messages)
}

// Clear removes all recorded messages
func (mjsb *mockJavaScriptBridge) Clear() {
	mjsb.mutex.Lock()
	defer mjsb.mutex.Unlock()
	mjsb.messages = mjsb.messages[:0]
}

// GetMessagesByType returns messages filtered by event type
func (mjsb *mockJavaScriptBridge) GetMessagesByType(eventType string) []MockMessage {
	mjsb.mutex.RLock()
	defer mjsb.mutex.RUnlock()

	var result []MockMessage
	for _, msg := range mjsb.messages {
		if msg.EventType == eventType {
			result = append(result, msg)
		}
	}
	return result
}

// GetMessagesBySubscription returns messages filtered by subscription ID
func (mjsb *mockJavaScriptBridge) GetMessagesBySubscription(subscriptionID string) []MockMessage {
	mjsb.mutex.RLock()
	defer mjsb.mutex.RUnlock()

	var result []MockMessage
	for _, msg := range mjsb.messages {
		if msg.SubscriptionID == subscriptionID {
			result = append(result, msg)
		}
	}
	return result
}
