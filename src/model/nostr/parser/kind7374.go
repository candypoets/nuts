// kind7374.go - Quote Event

package parser

import (
	"fmt"
	"strconv"
	"time"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind7374Parsed represents a parsed quote event for redeeming Cashu tokens
type Kind7374Parsed struct {
	QuoteID    string    `json:"quoteId" msgpack:"quoteId"`
	MintURL    string    `json:"mintUrl" msgpack:"mintUrl"`
	Expiration time.Time `json:"expiration" msgpack:"expiration"`
}

// ParseKind7374 parses a kind 7374 (quote) event
func (p *Parser) ParseKind7374(event nostr.Event) (*Kind7374Parsed, *[]types.Request, error) {
	if event.Kind != 7374 {
		return nil, nil, fmt.Errorf("event is not kind 7374")
	}

	// Extract mint URL from tags
	var mintURL string
	var expirationUnix int64

	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			if tag[0] == "mint" {
				mintURL = tag[1]
			} else if tag[0] == "expiration" {
				if expTS, err := strconv.ParseInt(tag[1], 10, 64); err == nil {
					expirationUnix = expTS
				}
			}
		}
	}

	if mintURL == "" {
		return nil, nil, fmt.Errorf("mint URL not found in quote event")
	}

	// Try to decrypt the quote ID if the signer is available
	var quoteID string
	if p.Signer != nil {
		pubkey, _ := p.Signer.Current.GetPublicKey()
		decrypted, err := p.Signer.Current.NIP44Decrypt(pubkey, event.Content)
		if err == nil && decrypted != "" {
			quoteID = decrypted
		}
	}

	// Create expiration time
	var expiration time.Time
	if expirationUnix > 0 {
		expiration = time.Unix(expirationUnix, 0)
	} else {
		// No expiration provided, leave it as zero value
		expiration = time.Time{}
	}

	return &Kind7374Parsed{
		QuoteID:    quoteID,
		MintURL:    mintURL,
		Expiration: expiration,
	}, nil, nil
}

// PrepareKind7374 prepares a kind 7374 event for publishing by encrypting content and signing
func (p *Parser) PrepareKind7374(event *nostr.Event) error {
	if event.Kind != 7374 {
		return fmt.Errorf("event is not kind 7374")
	}

	// Validate required tags
	var hasMint bool
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "mint" {
			hasMint = true
			break
		}
	}

	if !hasMint {
		return fmt.Errorf("kind 7374 events must have a mint tag")
	}

	currentSigner := p.Signer.Current

	if currentSigner == nil {
		return fmt.Errorf("signer is required for kind 7374 events")
	}

	pubkey, _ := currentSigner.GetPublicKey()
	// NIP-44 encrypt the quote ID content
	encrypted, err := currentSigner.NIP44Encrypt(pubkey, event.Content)
	if err != nil {
		return fmt.Errorf("failed to encrypt quote ID: %w", err)
	}
	event.Content = encrypted

	// Sign the event
	return currentSigner.SignEvent(event)
}
