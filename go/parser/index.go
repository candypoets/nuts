package parser

import (
	"fmt"

	"github.com/candypoets/nutscash/db"
	"github.com/candypoets/nutscash/signer"
	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// Parser is a unified parser for different kinds of Nostr events
type Parser struct {
	DB            *db.NostrDB // Database connection
	Signer        signer.Signer
	DefaultRelays []string // Default relays to use if none are specified in the event
}

// NewParser creates a new Parser instance with the given database
func NewParser(db *db.NostrDB, defaultRelays []string) *Parser {
	return &Parser{
		DB:            db,
		DefaultRelays: defaultRelays,
	}
}

func (p *Parser) GetRelays(event nostr.Event) []string {
	if len(event.Tags) == 0 {
		return p.DefaultRelays
	}

	var relays []string
	for _, tag := range event.Tags {
		if tag[0] == "r" {
			relays = append(relays, tag[1])
		}
	}

	if len(relays) == 0 {
		return p.DefaultRelays
	}

	return relays
}

// Parse automatically determines the correct parser based on event kind
func (p *Parser) Parse(event nostr.Event) (types.ParsedEvent, error) {
	switch event.Kind {
	case 0:
		parsed, requests, err := p.ParseKind0(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 1:
		parsed, requests, err := p.ParseKind1(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 3:
		parsed, requests, err := p.ParseKind3(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 4:
		parsed, requests, err := p.ParseKind4(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 7:
		parsed, requests, err := p.ParseKind7(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 17:
		parsed, requests, err := p.ParseKind17(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 7376:
		parsed, requests, err := p.ParseKind7376(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 9321:
		parsed, requests, err := p.ParseKind9321(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 9735:
		parsed, requests, err := p.ParseKind9735(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 10002:
		parsed, requests, err := p.ParseKind10002(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 10019:
		parsed, requests, err := p.ParseKind10019(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	default:
		return types.ParsedEvent{
			Event:    event,
			Parsed:   nil,
			Requests: nil,
		}, fmt.Errorf("no parser available for kind %d", event.Kind)
	}
}
