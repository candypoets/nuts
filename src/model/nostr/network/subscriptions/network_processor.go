//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
	"github.com/rs/zerolog"
)

// networkProcessor implements the NetworkProcessor interface
type networkProcessor struct {
	relayManager RelayManager
	parser       EventParser
	optimizer    SubscriptionOptimizer
	logger       zerolog.Logger
}

// NewNetworkProcessor creates a new network processor
func NewNetworkProcessor(
	relayManager RelayManager,
	parser EventParser,
	optimizer SubscriptionOptimizer,
	logger zerolog.Logger,
) NetworkProcessor {
	return &networkProcessor{
		relayManager: relayManager,
		parser:       parser,
		optimizer:    optimizer,
		logger:       logger,
	}
}

// ProcessNetworkRequests handles network subscription processing
func (np *networkProcessor) ProcessNetworkRequests(
	ctx context.Context,
	requests []types.Request,
) <-chan NetworkEvent {
	eventChan := make(chan NetworkEvent, 100) // Buffer of 100 events, channel won't close when full - just blocks until space is available

	go func() {
		defer close(eventChan)

		if len(requests) == 0 {
			return
		}

		// Optimize subscription requests
		optimizedRequests := np.optimizer.OptimizeSubscriptions(requests)

		var wg sync.WaitGroup
		totalConnections := 0
		remainingConnections := 0

		for _, req := range optimizedRequests {
			if len(req.Relays) == 0 {
				continue
			}

			for _, relayURL := range req.Relays {
				wg.Add(1)
				totalConnections++
				remainingConnections++

				go np.processRelaySubscription(
					ctx,
					&wg,
					relayURL,
					req.ToFilter(),
					eventChan,
					&remainingConnections,
					&totalConnections,
					req.CloseOnEOSE,
				)
			}
		}

		// Wait for all relay subscriptions to complete
		wg.Wait()
	}()

	return eventChan
}

// processRelaySubscription handles subscription to a single relay
func (np *networkProcessor) processRelaySubscription(
	ctx context.Context,
	wg *sync.WaitGroup,
	relayURL string,
	filter nostr.Filter,
	eventChan chan<- NetworkEvent,
	remainingConnections *int,
	totalConnections *int,
	closeOnEOSE bool,
) {
	defer wg.Done()

	// Create subscription context
	subCtx, subCancel := context.WithCancel(ctx)
	defer subCancel()

	// Get relay connection
	relayConn, err := np.relayManager.GetRelay(relayURL)

	if err != nil {
		np.logger.Error().
			Str("relay", relayURL).
			Err(err).
			Msg("Error connecting to relay")

		select {
		case eventChan <- NetworkEvent{
			Type:  NetworkEventTypeError,
			Error: err,
			Relay: relayURL,
		}:
		case <-ctx.Done():
		}
		return
	}

	// Check for nil relay connection
	if relayConn == nil {
		np.logger.Error().
			Str("relay", relayURL).
			Msg("Relay connection is nil")

		select {
		case eventChan <- NetworkEvent{
			Type:  NetworkEventTypeError,
			Error: fmt.Errorf("relay connection is nil for %s", relayURL),
			Relay: relayURL,
		}:
		case <-ctx.Done():
		}
		return
	}

	// Ensure relay is released when done
	defer np.relayManager.ReleaseRelay(relayURL)

	// Subscribe to relay
	sub, err := relayConn.Subscribe(subCtx, []nostr.Filter{filter})
	if err != nil {
		np.logger.Error().
			Str("relay", relayURL).
			Err(err).
			Msg("Error subscribing to relay")

		// Handle relay disconnection
		if strings.Contains(err.Error(), "not connected to") {
			np.logger.Info().
				Str("relay", relayURL).
				Msg("Attempting to reconnect to relay")
			np.relayManager.MarkRelayAsClosed(relayURL, err)
		}

		select {
		case eventChan <- NetworkEvent{
			Type:  NetworkEventTypeError,
			Error: err,
			Relay: relayURL,
		}:
		case <-ctx.Done():
		}
		return
	}

	// Process subscription events
	np.handleSubscriptionEvents(subCtx, sub, relayURL, eventChan, remainingConnections, totalConnections, closeOnEOSE)
}

// handleSubscriptionEvents processes events from a relay subscription
func (np *networkProcessor) handleSubscriptionEvents(
	ctx context.Context,
	sub *nostr.Subscription,
	relayURL string,
	eventChan chan<- NetworkEvent,
	remainingConnections *int,
	totalConnections *int,
	closeOnEOSE bool,
) {
	defer sub.Unsub()

	for {
		select {
		case <-ctx.Done():
			np.logger.Debug().
				Str("relay", relayURL).
				Msg("Subscription context cancelled")
			return

		case ev, more := <-sub.Events:
			if !more {
				np.logger.Debug().
					Str("relay", relayURL).
					Msg("Subscription events channel closed")
				return
			}

			// Store relay hint
			np.parser.GetRelayHint(*ev)

			// Parse the event
			parsedEvent, err := np.parser.Parse(*ev)
			if err != nil {
				np.logger.Error().
					Str("relay", relayURL).
					Str("event_id", ev.ID).
					Err(err).
					Msg("Error parsing event")

				select {
				case eventChan <- NetworkEvent{
					Type:  NetworkEventTypeError,
					Error: err,
					Relay: relayURL,
				}:
				case <-ctx.Done():
					return
				}
				continue
			}

			// Send parsed event
			select {
			case eventChan <- NetworkEvent{
				Type:  NetworkEventTypeEvent,
				Event: &parsedEvent,
				Relay: relayURL,
			}:
			case <-ctx.Done():
				return
			}

		case <-sub.EndOfStoredEvents:
			*remainingConnections--
			currentRemaining := *remainingConnections
			currentTotal := *totalConnections

			eose := &types.EOSE{
				TotalConnections:     currentTotal,
				RemainingConnections: currentRemaining,
			}

			select {
			case eventChan <- NetworkEvent{
				Type:  NetworkEventTypeEOSE,
				EOSE:  eose,
				Relay: relayURL,
			}:
			case <-ctx.Done():
				return
			}

			if closeOnEOSE {
				np.logger.Debug().
					Str("relay", relayURL).
					Int("remaining", currentRemaining).
					Int("total", currentTotal).
					Msg("End of stored events received, closing subscription as requested")
				return
			}

			np.logger.Debug().
				Str("relay", relayURL).
				Int("remaining", currentRemaining).
				Int("total", currentTotal).
				Msg("End of stored events received, keeping subscription open for real-time updates")
		}
	}
}

// GetConnectionStats returns statistics about network connections
func (np *networkProcessor) GetConnectionStats() NetworkProcessorStats {
	return NetworkProcessorStats{
		ActiveConnections: 0, // This would be tracked in a real implementation
		TotalEvents:       0,
		ErrorCount:        0,
		LastActivity:      time.Now(),
	}
}

// ValidateFilters performs basic validation on subscription filters
func (np *networkProcessor) ValidateFilters(filters []nostr.Filter) error {
	for i, filter := range filters {
		if len(filter.Authors) == 0 && len(filter.IDs) == 0 && len(filter.Kinds) == 0 {
			return &ValidationError{
				Field:   "filter",
				Index:   i,
				Message: "filter must have at least one constraint (authors, IDs, or kinds)",
			}
		}

		// Check for reasonable limits to prevent abuse
		if len(filter.Authors) > 1000 {
			return &ValidationError{
				Field:   "authors",
				Index:   i,
				Message: "too many authors in filter (max 1000)",
			}
		}

		if len(filter.IDs) > 1000 {
			return &ValidationError{
				Field:   "ids",
				Index:   i,
				Message: "too many IDs in filter (max 1000)",
			}
		}
	}
	return nil
}

// NetworkProcessorStats represents network processing statistics
type NetworkProcessorStats struct {
	ActiveConnections int
	TotalEvents       int64
	ErrorCount        int64
	LastActivity      time.Time
}

// ValidationError represents a filter validation error
type ValidationError struct {
	Field   string
	Index   int
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}
