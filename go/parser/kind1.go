package parser

import (
	"fmt"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip10"
	"github.com/nbd-wtf/go-nostr/nip27"
)

// Kind1Parsed represents the parsed data from a kind 1 (text note) event
type Kind1Parsed struct {
	ParsedContent []ContentBlock
	Quotes        []*nostr.ProfilePointer
	Mentions      []*nostr.EventPointer
	Reply         *nostr.EventPointer
	Root          *nostr.EventPointer
}

// ParseKind1 parses a kind 1 (text note) event
func (p *Parser) ParseKind1(event nostr.Event) (*Kind1Parsed, *[]types.Request, error) {
	// Create the necessary request objects
	var requests = []types.Request{}
	if event.Kind != 1 {
		return nil, nil, fmt.Errorf("event is nil or not kind 1")
	}

	parsed := &Kind1Parsed{}

	// Check if the event author is in the db
	_, authorExists := p.DB.GetProfile(event.PubKey)

	if !authorExists {
		newRequest := types.NewRequest(p.GetRelays(event), nostr.Filter{
			Kinds:   []int{0},
			Authors: []string{event.PubKey},
		})
		requests = append(requests, newRequest)
	}

	parsedRefs := nip27.ParseReferences(event)

	// Process references using the iter.Seq pattern
	parsedRefs(func(ref nip27.Reference) bool {
		// Process based on the pointer type
		switch pointer := ref.Pointer.(type) {
		case *nostr.ProfilePointer:
			// Check if profile exists in DB
			_, exists := p.DB.GetProfile(pointer.PublicKey)
			parsed.Quotes = append(parsed.Quotes, pointer)

			if !exists {
				newRequest := types.NewRequest(p.GetRelays(event), nostr.Filter{
					Authors: []string{pointer.PublicKey},
					Kinds:   []int{0},
				})
				requests = append(requests, newRequest)
			}

		case *nostr.EventPointer:
			// Check if event exists
			_, exists := p.DB.GetEvent(pointer.ID)
			parsed.Mentions = append(parsed.Mentions, pointer)

			if !exists {
				newRequest := types.NewRequest(p.GetRelays(event), nostr.Filter{
					IDs: []string{pointer.ID},
				})
				requests = append(requests, newRequest)
			}

		case *nostr.EntityPointer:

			// Check if address exists
			filter := nostr.Filter{
				Kinds:   []int{pointer.Kind},
				Authors: []string{pointer.PublicKey},
				Tags:    map[string][]string{"#d": {pointer.Identifier}},
			}

			exists, _ := p.DB.QueryEvents(filter, 1)

			if len(exists) == 0 {
				newRequest := types.NewRequest(p.GetRelays(event), filter)
				requests = append(requests, newRequest)
			}
		}

		return true // Continue iteration
	})

	// Extract reply and root
	parsed.Reply = nip10.GetImmediateParent(event.Tags)
	parsed.Root = nip10.GetThreadRoot(event.Tags)

	// Parse content
	parsedContent, err := ParseContent(event.Content)
	if err != nil {
		return nil, nil, fmt.Errorf("error parsing content: %w", err)
	}
	parsed.ParsedContent = parsedContent

	return parsed, &requests, nil
}
