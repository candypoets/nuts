//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"fmt"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
	"github.com/rs/zerolog"
)

const (
	MaxRecursionDepth = 2
)

// cacheProcessor implements the CacheProcessor interface
type cacheProcessor struct {
	database EventDatabase
	parser   EventParser
	logger   zerolog.Logger
}

// NewCacheProcessor creates a new cache processor
func NewCacheProcessor(database EventDatabase, parser EventParser, logger zerolog.Logger) CacheProcessor {
	return &cacheProcessor{
		database: database,
		parser:   parser,
		logger:   logger,
	}
}

// ProcessLocalRequests searches for events in the database based on requests,
// processes them, and recursively handles any resulting requests up to a maximum depth.
func (cp *cacheProcessor) ProcessLocalRequests(
	ctx context.Context,
	requests []types.Request,
	depth int,
) ([]types.Request, [][]types.ParsedEvent, error) {
	if depth >= MaxRecursionDepth {
		cp.logger.Debug().
			Int("depth", depth).
			Msg("Reached maximum recursion depth for local requests")
		return make([]types.Request, 0), make([][]types.ParsedEvent, 0), nil
	}

	filteredRequests, events, err := cp.database.QueryEventsForRequests(requests, depth > 0)
	if err != nil {
		cp.logger.Warn().
			Err(err).
			Int("depth", depth).
			Msg("Error querying database")
		return filteredRequests, nil, fmt.Errorf("database query failed: %w", err)
	}

	processedEvents := make([][]types.ParsedEvent, 0, len(events))

	for _, event := range events {
		select {
		case <-ctx.Done():
			return filteredRequests, processedEvents, ctx.Err()
		default:
		}

		// Store relay hint if present
		cp.parser.GetRelayHint(event.Event)

		// Parse event if not already parsed
		if event.Parsed == nil {
			parsedEvent, err := cp.parser.Parse(nostr.Event{
				ID:        event.ID,
				Kind:      event.Kind,
				CreatedAt: event.CreatedAt,
				Tags:      event.Tags,
				Content:   event.Content,
				PubKey:    event.PubKey,
				Sig:       event.Sig,
			})
			if err != nil {
				cp.logger.Warn().
					Err(err).
					Str("event_id", event.ID).
					Msg("Error parsing event from database")
				continue
			}
			event = parsedEvent
		}

		eventsWithContext := []types.ParsedEvent{event}

		// Handle recursive requests from parsed event
		if event.Requests != nil && len(*event.Requests) > 0 {
			contextEvents := cp.FindEventContext(event, 3)
			// Append child events to the current event's context
			eventsWithContext = append(eventsWithContext, contextEvents...)
		}

		processedEvents = append(processedEvents, eventsWithContext)
	}

	return filteredRequests, processedEvents, nil
}

// FindEventContext builds context for an event by recursively finding related events
func (cp *cacheProcessor) FindEventContext(event types.ParsedEvent, maxDepth int) []types.ParsedEvent {
	var context []types.ParsedEvent
	cp.findEventContextRecursive(event, &context, 0, maxDepth, make(map[string]bool))
	return context
}

// findEventContextRecursive is the internal recursive function for building event context
func (cp *cacheProcessor) findEventContextRecursive(
	event types.ParsedEvent,
	context *[]types.ParsedEvent,
	depth int,
	maxDepth int,
	visited map[string]bool,
) {
	if depth > maxDepth {
		return
	}

	// Avoid infinite loops by tracking visited events
	if visited[event.ID] {
		return
	}
	visited[event.ID] = true

	// Process requests from this event
	if event.Requests != nil && len(*event.Requests) > 0 {
		for _, request := range *event.Requests {
			relatedEvents, err := cp.database.QueryEvents(request.ToFilter())
			if err != nil {
				cp.logger.Warn().
					Err(err).
					Str("event_id", event.ID).
					Msg("Error querying related events")
				continue
			}

			for _, relatedEvent := range relatedEvents {
				*context = append(*context, relatedEvent)
				cp.findEventContextRecursive(relatedEvent, context, depth+1, maxDepth, visited)
			}
		}
	}
}

// GetEventsByFilter is a helper method to query events by filter
func (cp *cacheProcessor) GetEventsByFilter(filter nostr.Filter) ([]types.ParsedEvent, error) {
	return cp.database.QueryEvents(filter)
}

// ValidateEvent performs basic validation on an event
func (cp *cacheProcessor) ValidateEvent(event types.ParsedEvent) error {
	if event.ID == "" {
		return fmt.Errorf("event ID cannot be empty")
	}
	if event.PubKey == "" {
		return fmt.Errorf("event public key cannot be empty")
	}
	if event.CreatedAt == 0 {
		return fmt.Errorf("event created_at cannot be zero")
	}
	return nil
}

// ShouldCacheEvent determines if an event should be cached based on its kind
func (cp *cacheProcessor) ShouldCacheEvent(event types.ParsedEvent) bool {
	cachableKinds := map[int]bool{
		0:     true, // Metadata events
		3:     true, // Contact lists
		4:     true, // Direct messages
		10002: true, // Relay list metadata
		10019: true, // nuts.cash user settings
		17375: true, // nuts.cash encrypted wallet event
	}
	return cachableKinds[event.Kind]
}

// GetStatistics returns processing statistics
func (cp *cacheProcessor) GetStatistics() CacheProcessorStats {
	// This would be implemented with actual metrics collection
	return CacheProcessorStats{
		EventsProcessed:  0,
		CacheHits:        0,
		CacheMisses:      0,
		RecursiveQueries: 0,
	}
}

// CacheProcessorStats represents processing statistics
type CacheProcessorStats struct {
	EventsProcessed  int64
	CacheHits        int64
	CacheMisses      int64
	RecursiveQueries int64
}
