package parser

import (
	"encoding/json"
	"fmt"

	"github.com/candypoets/nutscash/db"
	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"

	"github.com/vmihailenco/msgpack/v5"
)

// ParsedEvent represents a Nostr event with additional parsed data
type ParsedEvent struct {
	nostr.Event
	Parsed interface{} `json:"parsed,omitempty"`
	Relays []string    `json:"relays,omitempty"`
}

// Custom JSON marshaler to properly format the output
func (pe ParsedEvent) MarshalJSON() ([]byte, error) {
	// Create an anonymous struct with proper JSON tags
	return json.Marshal(struct {
		ID        string          `json:"id"`
		PubKey    string          `json:"pubkey"`
		CreatedAt nostr.Timestamp `json:"created_at"`
		Kind      int             `json:"kind"`
		Tags      nostr.Tags      `json:"tags"`
		Content   string          `json:"content"`
		Sig       string          `json:"sig"`
		Parsed    interface{}     `json:"parsed,omitempty"`
		Relays    []string        `json:"relays,omitempty"`
	}{
		ID:        pe.ID,
		PubKey:    pe.PubKey,
		CreatedAt: pe.CreatedAt,
		Kind:      pe.Kind,
		Tags:      pe.Tags,
		Content:   pe.Content,
		Sig:       pe.Sig,
		Parsed:    pe.Parsed,
		Relays:    pe.Relays,
	})
}

// Custom MessagePack marshaler to properly format the output
func (pe ParsedEvent) EncodeMsgpack(enc *msgpack.Encoder) error {
	// Create an anonymous struct with MessagePack tags
	return enc.Encode(struct {
		ID        string          `msgpack:"id"`
		PubKey    string          `msgpack:"pubkey"`
		CreatedAt nostr.Timestamp `msgpack:"created_at"`
		Kind      int             `msgpack:"kind"`
		Tags      nostr.Tags      `msgpack:"tags"`
		Content   string          `msgpack:"content"`
		Sig       string          `msgpack:"sig"`
		Parsed    interface{}     `msgpack:"parsed,omitempty"`
		Relays    []string        `msgpack:"relays,omitempty"`
	}{
		ID:        pe.ID,
		PubKey:    pe.PubKey,
		CreatedAt: pe.CreatedAt,
		Kind:      pe.Kind,
		Tags:      pe.Tags,
		Content:   pe.Content,
		Sig:       pe.Sig,
		Parsed:    pe.Parsed,
		Relays:    pe.Relays,
	})
}

// Parser is a unified parser for different kinds of Nostr events
type Parser struct {
	DB            *db.NostrDB // Database connection
	DefaultRelays []string    // Default relays to use if none are specified in the event
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
func (p *Parser) Parse(event nostr.Event) (ParsedEvent, *[]types.Request, error) {
	switch event.Kind {
	case 0:
		parsed, requests, err := p.ParseKind0(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 1:
		parsed, requests, err := p.ParseKind1(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 3:
		parsed, requests, err := p.ParseKind3(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 7:
		parsed, requests, err := p.ParseKind7(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 17:
		parsed, requests, err := p.ParseKind17(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 7376:
		parsed, requests, err := p.ParseKind7376(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 9321:
		parsed, requests, err := p.ParseKind9321(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 9735:
		parsed, requests, err := p.ParseKind9735(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 10002:
		parsed, requests, err := p.ParseKind10002(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	case 10019:
		parsed, requests, err := p.ParseKind10019(event)
		return ParsedEvent{
			Event:  event,
			Parsed: parsed,
		}, requests, err
	default:
		return ParsedEvent{
			Event:  event,
			Parsed: nil,
		}, nil, fmt.Errorf("no parser available for kind %d", event.Kind)
	}
}
