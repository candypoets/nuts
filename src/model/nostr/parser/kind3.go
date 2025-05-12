package parser

import (
	"fmt"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Contact represents a contact from a kind 3 (contact list) event
type Contact struct {
	Pubkey  string   `json:"pubkey" msgpack:"pubkey"`
	Relays  []string `json:"relays,omitempty" msgpack:"relays,omitempty"`
	Petname string   `json:"petname,omitempty" msgpack:"petname,omitempty"`
}

// Kind3Parsed represents a parsed contact list
type Kind3Parsed []Contact

// ParseKind3 parses a kind 3 (contact list) event
func (p *Parser) ParseKind3(event nostr.Event) (*Kind3Parsed, *[]types.Request, error) {
	if event.Kind != 3 {
		return nil, nil, fmt.Errorf("event is not kind 3")
	}

	var contacts Kind3Parsed

	// Extract contacts from p tags
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "p" {
			contact := Contact{
				Pubkey: tag[1],
			}

			// Add relay if present (position 2)
			if len(tag) >= 3 && tag[2] != "" {
				contact.Relays = []string{tag[2]}
			}

			// Add petname if present (position 3)
			if len(tag) >= 4 && tag[3] != "" {
				contact.Petname = tag[3]
			}

			contacts = append(contacts, contact)
		}
	}

	return &contacts, nil, nil
}
