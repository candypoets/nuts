// kind10019.go - Nutzap Information Event (revised)

package parser

import (
	"fmt"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// MintInfo represents details about a trusted mint
type MintInfo struct {
	URL       string   `json:"url" msgpack:"url"`                                 // Mint URL
	BaseUnits []string `json:"baseUnits,omitempty" msgpack:"baseUnits,omitempty"` // Supported base units (e.g., "sat", "usd")
}

// Kind10019Parsed represents parsed data from a kind 10019 event (nutzap information)
type Kind10019Parsed struct {
	TrustedMints []MintInfo `json:"trustedMints,omitempty" msgpack:"trustedMints,omitempty"` // Mints trusted by the user
	P2PKPubkey   string     `json:"p2pkPubkey,omitempty" msgpack:"p2pkPubkey,omitempty"`     // P2PK pubkey for receiving nutzaps
	ReadRelays   []string   `json:"readRelays,omitempty" msgpack:"readRelays,omitempty"`     // Relays where the user will be reading token events
}

// ParseKind10019 parses a kind 10019 event (nutzap information)
func (p *Parser) ParseKind10019(event nostr.Event) (*Kind10019Parsed, *[]types.Request, error) {
	if event.Kind != 10019 {
		return nil, nil, fmt.Errorf("event is nil or not kind 10019")
	}

	parsed := &Kind10019Parsed{}

	// Extract relay, mint, and pubkey tags
	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			switch tag[0] {
			case "relay":
				parsed.ReadRelays = append(parsed.ReadRelays, tag[1])
			case "mint":
				mintInfo := MintInfo{
					URL: tag[1],
				}

				// Extract base units if provided (position 2 and beyond)
				if len(tag) >= 3 {
					for i := 2; i < len(tag); i++ {
						if tag[i] != "" {
							mintInfo.BaseUnits = append(mintInfo.BaseUnits, tag[i])
						}
					}
				}

				parsed.TrustedMints = append(parsed.TrustedMints, mintInfo)
			case "pubkey":
				parsed.P2PKPubkey = tag[1]
			}
		}
	}

	// Check if required fields are present
	if len(parsed.TrustedMints) == 0 || parsed.P2PKPubkey == "" {
		return nil, nil, fmt.Errorf("missing required mint tags or pubkey tag")
	}

	return parsed, nil, nil
}

// PrepareKind10019 prepares a kind 10019 event for publishing
func (p *Parser) PrepareKind10019(event *nostr.Event) error {
	if event.Kind != 10019 {
		return fmt.Errorf("event is not kind 10019")
	}

	// Validate required tags
	var hasMint, hasPubkey bool

	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			if tag[0] == "mint" {
				hasMint = true
			} else if tag[0] == "pubkey" {
				hasPubkey = true
			}
		}
	}

	if !hasMint {
		return fmt.Errorf("kind 10019 must include at least one mint tag")
	}

	if !hasPubkey {
		return fmt.Errorf("kind 10019 must include a pubkey tag")
	}

	// Sign the event
	return p.Signer.SignEvent(event)
}
