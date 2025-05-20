package parser

import (
	"fmt"
	"time"

	"github.com/candypoets/nutscash/nostr/db"
	"github.com/candypoets/nutscash/nostr/relays"
	"github.com/candypoets/nutscash/nostr/signer"
	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Parser is a unified parser for different kinds of Nostr events
type Parser struct {
	DB            *db.NostrDB // Database connection
	Signer        *signer.SignerManager
	RelayManager  *relays.RelayConnectionManager
	DefaultRelays []string // Default relays to use if none are specified in the event
	IndexerRelays []string
	RelayHints    map[string][]string // Maps pubkey to relay hints
}

// NewParser creates a new Parser instance with the given database
func NewParser(db *db.NostrDB, signerManager *signer.SignerManager, relayManager *relays.RelayConnectionManager, defaultRelays []string, indexerRelays []string) *Parser {
	return &Parser{
		DB:            db,
		Signer:        signerManager,
		RelayManager:  relayManager,
		DefaultRelays: defaultRelays,
		IndexerRelays: indexerRelays,
	}
}

func (p *Parser) GetRelayHint(event nostr.Event) []string {
	var relayHints []string
	for _, tag := range event.Tags {
		if tag[0] == "r" {
			relayHints = append(relayHints, tag[1])
		}
	}
	if len(relayHints) > 0 {
		if p.RelayHints == nil {
			p.RelayHints = make(map[string][]string)
		}

		// Get existing hints for this pubkey
		existing, _ := p.RelayHints[event.PubKey]

		// Create a map to keep track of unique relays
		uniqueRelays := make(map[string]struct{})

		// Add existing relays to the uniqueRelays map
		for _, relay := range existing {
			uniqueRelays[relay] = struct{}{}
		}

		// Add new relays if they're unique
		for _, relay := range relayHints {
			uniqueRelays[relay] = struct{}{}
		}

		// Convert unique map back to slice
		updatedRelays := make([]string, 0, len(uniqueRelays))
		for relay := range uniqueRelays {
			updatedRelays = append(updatedRelays, relay)
		}

		// Update the relay hints
		p.RelayHints[event.PubKey] = updatedRelays
	}
	return relays.CleanRelays(relayHints)
}

func (p *Parser) GetRelays(kind int, pubkey string, write ...bool) []string {
	var relays []string

	// Check if there are any relay hints for this pubkey
	if hints, ok := p.RelayHints[pubkey]; ok && len(hints) > 0 {
		relays = append(relays, hints...)
	}

	if kind == 10002 || kind == 0 || kind == 10019 {
		if len(p.IndexerRelays) > 0 {
			indexerRelay := p.IndexerRelays[0]
			if len(p.IndexerRelays) > 1 {
				randomIndex := int(time.Now().UnixNano() % int64(len(p.IndexerRelays)))
				indexerRelay = p.IndexerRelays[randomIndex]
			}
			relays = append(relays, indexerRelay)
		}
	} else {
		nip65, exist := p.DB.QueryEvent(nostr.Filter{Kinds: []int{10002}, Authors: []string{pubkey}})
		if exist {
			parsed, _ := p.Parse(nip65.Event)
			relayList, ok := parsed.Parsed.(*Kind10002Parsed)
			if ok {
				for _, relay := range *relayList {
					if len(write) > 0 {
						if relay.Write == true {
							relays = append(relays, relay.URL)
						}
					} else {
						if relay.Read == true {
							relays = append(relays, relay.URL)
						}
					}
				}
			}
		} else {
			if len(p.DefaultRelays) > 0 {
				defaultRelay := p.DefaultRelays[0]
				if len(p.DefaultRelays) > 1 {
					randomIndex := int(time.Now().UnixNano() % int64(len(p.DefaultRelays)))
					defaultRelay = p.DefaultRelays[randomIndex]
				}
				relays = append(relays, defaultRelay)
			}
		}
	}

	if len(relays) < 3 {
		relay := p.RelayManager.PickRandomRelay()
		if relay != nil {
			relays = append(relays, relay.URL)
		}
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
	case 6:
		parsed, requests, err := p.ParseKind6(event)
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
