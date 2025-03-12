package parser

import (
	"fmt"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind10019Parsed represents parsed data from a kind 10019 event
type Kind10019Parsed struct {
	TrustedMints []string `json:"trustedMints,omitempty"` // Mints trusted by the user
	P2PKPubkey   string   `json:"p2pkPubkey,omitempty"`   // P2PK pubkey for receiving nutzaps
}

// ParseKind10019 parses a kind 10019 event (trusted mints and P2PK pubkey for nutzaps)
func (p *Parser) ParseKind10019(event nostr.Event) (*Kind10019Parsed, *[]types.Request, error) {
	if event.Kind != 10019 {
		return nil, nil, fmt.Errorf("event is nil or not kind 10019")
	}

	// Extract mint tags and pubkey tag
	var mintTags []string
	var pubkeyTag string

	// Find all mint tags
	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			if tag[0] == "mint" {
				mintTags = append(mintTags, tag[1])
			} else if tag[0] == "pubkey" {
				pubkeyTag = tag[1]
			}
		}
	}

	// Validate required data is present
	if len(mintTags) == 0 || pubkeyTag == "" {
		return nil, nil, fmt.Errorf("missing required mint tags or pubkey tag")
	}

	// Create the parsed result
	result := &Kind10019Parsed{
		TrustedMints: mintTags,
		P2PKPubkey:   pubkeyTag,
	}

	return result, nil, nil
}
