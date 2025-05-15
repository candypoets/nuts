package parser

import (
	"fmt"

	"github.com/candypoets/nutscash/nostr/db"
	"github.com/candypoets/nutscash/nostr/signer"
	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Parser is a unified parser for different kinds of Nostr events
type Parser struct {
	DB            *db.NostrDB // Database connection
	Signer        *signer.SignerManager
	DefaultRelays []string // Default relays to use if none are specified in the event
}

// NewParser creates a new Parser instance with the given database
func NewParser(db *db.NostrDB, signerManager *signer.SignerManager, defaultRelays []string) *Parser {
	return &Parser{
		DB:            db,
		Signer:        signerManager,
		DefaultRelays: defaultRelays,
	}
}

func (p *Parser) GetRelays(event nostr.Event) []string {
	var relays []string
	for _, tag := range event.Tags {
		if tag[0] == "r" {
			relays = append(relays, tag[1])
		}
	}

	if event.Kind == 10002 || event.Kind == 0 || event.Kind == 10019 {
		relays = append(relays, "wss://purplepag.es")
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
	case 7374:
		parsed, requests, err := p.ParseKind7374(event)
		return types.ParsedEvent{
			Event:    event,
			Parsed:   parsed,
			Requests: requests,
		}, err
	case 7375:
		parsed, requests, err := p.ParseKind7375(event)
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
	case 17375:
		parsed, requests, err := p.ParseKind17375(event)
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

func (p *Parser) Prepare(event *nostr.Event) error {
	switch event.Kind {
	case 4:
		return p.PrepareKind4(event)
	case 7374:
		return p.PrepareKind7374(event)
	case 7375:
		return p.PrepareKind7375(event)
	case 7376:
		return p.PrepareKind7376(event)
	case 9321:
		return p.PrepareKind9321(event)
	case 10019:
		return p.PrepareKind10019(event)
	case 17375:
		return p.PrepareKind17375(event)
	default:
		if event.Sig == "" {
			currentSigner := p.Signer.Current

			if currentSigner == nil {
				return fmt.Errorf("no current signer available")
			}

			err := currentSigner.SignEvent(event)

			if err != nil {
				return err
			}
		}
		return nil
	}
}
