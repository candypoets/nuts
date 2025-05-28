package parser

import (
	"encoding/json"
	"fmt"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind6Parsed represents a parsed repost event (kind 6)
type Kind6Parsed struct {
	RepostedEvent *types.ParsedEvent `json:"repostedEvent,omitempty" msgpack:"repostedEvent,omitempty"`
}

// ParseKind6 parses a kind 6 (repost) event
func (p *Parser) ParseKind6(event nostr.Event) (*Kind6Parsed, *[]types.Request, error) {
	var requests = []types.Request{}
	if event.Kind != 6 {
		return nil, nil, fmt.Errorf("event is not kind 6")
	}

	// Add request for the author's metadata
	requests = append(requests, types.Request{
		Kinds:       []int{0},
		Authors:     []string{event.PubKey},
		CacheFirst:  true,
		CloseOnEOSE: true,
		Relays:      p.GetRelays(0, event.PubKey),
	})

	// Find the e tag for the reposted event (should be the last one if multiple)
	eTag := event.Tags.FindLast("e")
	if eTag == nil || len(eTag) < 2 {
		return nil, nil, fmt.Errorf("repost must have at least one e tag")
	}

	eventID := eTag[1]

	// Extract relay hint if available
	var relayHint string
	if len(eTag) >= 3 {
		relayHint = eTag[2]
	}

	// Try to parse the reposted event from content
	var repostedEvent *types.ParsedEvent

	if event.Content != "" {
		var parsedEvent nostr.Event
		err := json.Unmarshal([]byte(event.Content), &parsedEvent)
		if err == nil && parsedEvent.ID != "" && parsedEvent.Kind == 1 {
			// Parse the event using kind1 parser
			parsedContent, parsedRequests, err := p.ParseKind1(parsedEvent)
			if err == nil {
				// Create a ParsedEvent with the parsed content
				repostedEvent = &types.ParsedEvent{
					Event:    parsedEvent,
					Parsed:   parsedContent,
					Requests: nil,
				}

				// Add all requests from kind1 parsing
				if parsedRequests != nil {
					requests = append(requests, *parsedRequests...)
				}
			}
		}
	}

	// If we couldn't parse the content or it was empty, request the original event
	if repostedEvent == nil {
		requests = append(requests, types.Request{
			IDs:         []string{eventID},
			CacheFirst:  true,
			CloseOnEOSE: true,
			Relays:      append(p.GetRelays(1, ""), relayHint),
		})
	}

	result := &Kind6Parsed{
		RepostedEvent: repostedEvent,
	}

	return result, &requests, nil
}
