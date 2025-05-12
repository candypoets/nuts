package parser

import (
	"fmt"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip10"
	"github.com/nbd-wtf/go-nostr/nip27"
)

// Kind1Parsed represents the parsed data from a kind 1 (text note) event
type Kind1Parsed struct {
	ParsedContent []ContentBlock          `json:"parsedContent" msgpack:"parsedContent"`
	Quotes        []*nostr.ProfilePointer `json:"quotes" msgpack:"quotes"`
	Mentions      []*nostr.EventPointer   `json:"mentions" msgpack:"mentions"`
	Reply         *nostr.EventPointer     `json:"reply" msgpack:"reply"`
	Root          *nostr.EventPointer     `json:"root" msgpack:"root"`
}

// ParseKind1 parses a kind 1 (text note) event
func (p *Parser) ParseKind1(event nostr.Event) (*Kind1Parsed, *[]types.Request, error) {
	// Create the necessary request objects
	var requests = []types.Request{}
	if event.Kind != 1 {
		return nil, nil, fmt.Errorf("event is nil or not kind 1")
	}

	parsed := &Kind1Parsed{}

	requests = append(requests, types.Request{
		Kinds:      []int{0},
		Authors:    []string{event.PubKey},
		CacheFirst: true,
		Relays:     p.GetRelays(event),
	})

	requests = append(requests, types.Request{
		Kinds:      []int{10002},
		Authors:    []string{event.PubKey},
		CacheFirst: true,
		Relays:     p.GetRelays(event),
	})

	parsedRefs := nip27.ParseReferences(event)

	// Process references using the iter.Seq pattern
	parsedRefs(func(ref nip27.Reference) bool {
		// Process based on the pointer type
		switch pointer := ref.Pointer.(type) {
		case nostr.ProfilePointer:
			// Check if profile exists in DB
			parsed.Quotes = append(parsed.Quotes, &pointer)

			requests = append(requests, types.Request{
				Authors:    []string{pointer.PublicKey},
				Kinds:      []int{0},
				CacheFirst: true,
				Limit:      1,
				Relays:     pointer.Relays,
			})

		case nostr.EventPointer:
			// Check if event exists
			parsed.Mentions = append(parsed.Mentions, &pointer)

			requests = append(requests, types.Request{
				IDs:        []string{pointer.ID},
				Limit:      1,
				CacheFirst: true,
				Relays:     pointer.Relays,
			})

		case nostr.EntityPointer:

			// Create a direct request using the pointer attributes
			requests = append(requests, types.Request{
				Kinds:      []int{pointer.Kind},
				Authors:    []string{pointer.PublicKey},
				Tags:       map[string][]string{"#d": {pointer.Identifier}},
				Limit:      1,
				CacheFirst: true,
				Relays:     pointer.Relays,
			})
		default:
			println(fmt.Printf("Unknown pointer type: %T\n", pointer))
		}

		return true // Continue iteration
	})

	// Extract reply and root
	parsed.Reply = nip10.GetImmediateParent(event.Tags)
	if parsed.Reply != nil {
		requests = append(requests, types.Request{
			IDs:        []string{parsed.Reply.ID},
			Limit:      1,
			CacheFirst: true,
			Relays:     parsed.Reply.Relays,
		})
	}

	parsed.Root = nip10.GetThreadRoot(event.Tags)
	if parsed.Root != nil && parsed.Root.ID != event.ID {
		requests = append(requests, types.Request{
			IDs:        []string{parsed.Root.ID},
			Limit:      1,
			CacheFirst: true,
			Relays:     parsed.Root.Relays,
		})
	}

	// Parse content
	parsedContent, err := ParseContent(event.Content)
	if err != nil {
		return nil, nil, fmt.Errorf("error parsing content: %w", err)
	}
	parsed.ParsedContent = parsedContent

	return parsed, &requests, nil
}
