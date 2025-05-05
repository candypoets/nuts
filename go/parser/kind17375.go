// kind17375.go - Wallet Event

package parser

import (
	"encoding/json"
	"fmt"
	"slices"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind17375Parsed represents a parsed wallet event
type Kind17375Parsed struct {
	Mints       []string `json:"mints" msgpack:"mints"`                                 // List of mint URLs
	P2PKPrivKey string   `json:"p2pkPrivKey,omitempty" msgpack:"p2pkPrivKey,omitempty"` // Private key for P2PK ecash (if decrypted)
	Decrypted   bool     `json:"decrypted" msgpack:"decrypted"`                         // Whether content was successfully decrypted
}

// ParseKind17375 parses a kind 17375 (wallet) event
func (p *Parser) ParseKind17375(event nostr.Event) (*Kind17375Parsed, *[]types.Request, error) {
	if event.Kind != 17375 {
		return nil, nil, fmt.Errorf("event is not kind 17375")
	}

	parsed := &Kind17375Parsed{
		Decrypted: false,
	}

	// Try to decrypt the content if signer is available
	if p.Signer != nil {
		pubkey, _ := p.Signer.GetPublicKey()
		decrypted, err := p.Signer.NIP44Decrypt(pubkey, event.Content)
		if err == nil && decrypted != "" {
			var tags [][]string
			if err := json.Unmarshal([]byte(decrypted), &tags); err == nil {
				parsed.Decrypted = true

				// Process decrypted tags
				for _, tag := range tags {
					if len(tag) >= 2 {
						switch tag[0] {
						case "mint":
							parsed.Mints = append(parsed.Mints, tag[1])
							break
						case "privkey":
							parsed.P2PKPrivKey = tag[1]
							break
						}
					}
				}
			}
		}

		// Also check for unencrypted mint tags in the event
		for _, tag := range event.Tags {
			if len(tag) >= 2 && tag[0] == "mint" {
				// Only add if not already in the list
				found := slices.Contains(parsed.Mints, tag[1])
				if !found {
					parsed.Mints = append(parsed.Mints, tag[1])
				}
			}
		}

		return parsed, nil, nil
	}
	return parsed, nil, nil
}

// PrepareKind17375 prepares a kind 17375 event for publishing by encrypting content and signing
func (p *Parser) PrepareKind17375(event *nostr.Event) error {
	if event.Kind != 17375 {
		return fmt.Errorf("event is not kind 17375")
	}

	// For wallet events, the content should be an array of tags
	var tags [][]string
	if err := json.Unmarshal([]byte(event.Content), &tags); err != nil {
		return fmt.Errorf("invalid wallet content: %w", err)
	}

	// Check for required mint tags and validate privkey if present
	var hasMint, hasPrivkey bool
	for _, tag := range tags {
		if len(tag) >= 2 {
			if tag[0] == "mint" {
				hasMint = true
			} else if tag[0] == "privkey" {
				hasPrivkey = true
				// Optionally validate the private key format
				if len(tag[1]) < 32 {
					return fmt.Errorf("private key appears invalid")
				}
			}
		}
	}

	// Mint tag is required in the content
	if !hasMint {
		return fmt.Errorf("wallet must include at least one mint")
	}

	// If no private key was provided, generate one
	if !hasPrivkey {
		// Generate a new random private key using go-nostr
		privKey := nostr.GeneratePrivateKey()
		if privKey == "" {
			return fmt.Errorf("failed to generate private key")
		}

		// Add the private key to the tags
		tags = append(tags, []string{"privkey", privKey})
	}

	// NIP-44 encrypt the content
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return fmt.Errorf("failed to marshal tags: %w", err)
	}

	pubkey, _ := p.Signer.GetPublicKey()

	encrypted, err := p.Signer.NIP44Encrypt(pubkey, string(tagsJSON))
	if err != nil {
		return fmt.Errorf("failed to encrypt tags: %w", err)
	}
	event.Content = encrypted

	// Sign the event
	return p.Signer.SignEvent(event)
}
