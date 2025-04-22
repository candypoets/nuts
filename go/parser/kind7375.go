// kind7375.go - Token Event

package parser

import (
	"encoding/json"
	"fmt"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind7375Parsed represents a parsed token event
type Kind7375Parsed struct {
	MintURL    string             `json:"mintUrl" msgpack:"mintUrl"`
	Proofs     []types.ProofUnion `json:"proofs" msgpack:"proofs"`
	DeletedIDs []string           `json:"deletedIds,omitempty" msgpack:"deletedIds,omitempty"` // IDs of token events that were deleted
	Decrypted  bool               `json:"decrypted" msgpack:"decrypted"`                       // Whether the content was successfully decrypted
}

// TokenContent represents the encrypted content of a token event
type TokenContent struct {
	Mint   string             `json:"mint" msgpack:"mint"`
	Id     string             `json:"id" msgpack:"id"`
	Proofs []types.ProofUnion `json:"proofs" msgpack:"proofs"`
	Del    []string           `json:"del,omitempty" msgpack:"del,omitempty"`
}

// ParseKind7375 parses a kind 7375 (token) event
func (p *Parser) ParseKind7375(event nostr.Event) (*Kind7375Parsed, *[]types.Request, error) {
	if event.Kind != 7375 {
		return nil, nil, fmt.Errorf("event is not kind 7375")
	}

	parsed := &Kind7375Parsed{
		Decrypted: false,
	}

	// Try to decrypt the content if signer is available
	if p.Signer != nil {
		pubkey, _ := p.Signer.GetPublicKey()
		decrypted, err := p.Signer.NIP44Decrypt(pubkey, event.Content)
		if err == nil && decrypted != "" {
			var content TokenContent
			if err := json.Unmarshal([]byte(decrypted), &content); err == nil {
				parsed.MintURL = content.Mint
				parsed.Proofs = content.Proofs
				parsed.DeletedIDs = content.Del
				parsed.Decrypted = true
			}
		}
	}

	return parsed, nil, nil
}

// PrepareKind7375 prepares a kind 7375 event for publishing by encrypting content and signing
func (p *Parser) PrepareKind7375(event *nostr.Event) error {
	if event.Kind != 7375 {
		return fmt.Errorf("event is not kind 7375")
	}

	// Content must be a valid JSON for TokenContent
	var content TokenContent
	if err := json.Unmarshal([]byte(event.Content), &content); err != nil {
		return fmt.Errorf("invalid token content: %w", err)
	}

	// Validate content
	if content.Mint == "" {
		return fmt.Errorf("token content must specify a mint")
	}

	if len(content.Proofs) == 0 {
		return fmt.Errorf("token content must include at least one proof")
	}

	// NIP-44 encrypt the content
	contentJSON, err := json.Marshal(content)
	if err != nil {
		return fmt.Errorf("failed to marshal token content: %w", err)
	}
	pubkey, _ := p.Signer.GetPublicKey()

	encrypted, err := p.Signer.NIP44Encrypt(pubkey, string(contentJSON))
	if err != nil {
		return fmt.Errorf("failed to encrypt token content: %w", err)
	}
	event.Content = encrypted

	// Sign the event
	return p.Signer.SignEvent(event)
}
