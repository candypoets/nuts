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
		eventType := args[0].String()
		eventData := map[string]any{
			"type":           eventType,
			"subscriptionId": args[1].String(),
		}

		// Use transferables ONLY for CACHED_EVENT and FETCHED_EVENT
		if len(args) >= 3 && (eventType == "CACHED_EVENT" || eventType == "FETCHED_EVENT") {
			// Extract buffer and transfer it

			buffer := args[2].Get("buffer")
			eventData["eventData"] = args[2]
			// Create array for transferables - postMessage expects an array
			transferArray := js.ValueOf([]any{buffer})
			js.Global().Get("self").Call("postMessage", eventData, transferArray)
		} else {
			// For other event types, include data normally
			if len(args) >= 3 {
				eventData["eventData"] = args[2]
			}
			js.Global().Get("self").Call("postMessage", eventData)
		}
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
