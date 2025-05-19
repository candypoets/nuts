// kind7376.go - Spending History Event

package parser

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// HistoryTag represents a tag in the spending history
type HistoryTag struct {
	Name   string `json:"name" msgpack:"name"`
	Value  string `json:"value" msgpack:"value"`
	Relay  string `json:"relay,omitempty" msgpack:"relay,omitempty"`
	Marker string `json:"marker,omitempty" msgpack:"marker,omitempty"`
}

// Kind7376Parsed represents a parsed spending history event
type Kind7376Parsed struct {
	Direction       string       `json:"direction" msgpack:"direction"`             // "in" or "out"
	Amount          int          `json:"amount" msgpack:"amount"`                   // Amount in sats
	CreatedEvents   []string     `json:"createdEvents" msgpack:"createdEvents"`     // IDs of token events created
	DestroyedEvents []string     `json:"destroyedEvents" msgpack:"destroyedEvents"` // IDs of token events destroyed
	RedeemedEvents  []string     `json:"redeemedEvents" msgpack:"redeemedEvents"`   // IDs of NIP-61 nutzap events redeemed
	Tags            []HistoryTag `json:"tags,omitempty" msgpack:"tags,omitempty"`   // All decrypted tags
	Decrypted       bool         `json:"decrypted" msgpack:"decrypted"`             // Whether content was successfully decrypted
}

// ParseKind7376 parses a kind 7376 (spending history) event
func (p *Parser) ParseKind7376(event nostr.Event) (*Kind7376Parsed, *[]types.Request, error) {
	if event.Kind != 7376 {
		return nil, nil, fmt.Errorf("event is not kind 7376")
	}

	var requests = []types.Request{}

	parsed := &Kind7376Parsed{
		Decrypted: false,
	}

	// Process unencrypted e tags with "redeemed" marker
	for _, tag := range event.Tags {
		if len(tag) >= 4 && tag[0] == "e" && tag[3] == "redeemed" {
			parsed.RedeemedEvents = append(parsed.RedeemedEvents, tag[1])
			// append a new request
			requests = append(requests, types.Request{
				Kinds:      []int{7375},
				IDs:        []string{tag[1]},
				CacheFirst: true,
				Relays:     p.GetRelays(7375, event.PubKey),
			})
		}
	}

	currentSigner := p.Signer.Current

	// Return early if there's no signer
	if currentSigner == nil {
		return nil, &requests, fmt.Errorf("no signer available for decryption")
	}

	// Try to decrypt the content if signer is available
	pubkey, _ := currentSigner.GetPublicKey()
	decrypted, err := currentSigner.NIP44Decrypt(pubkey, event.Content)
	if err == nil && decrypted != "" {
		var tags [][]string
		if err := json.Unmarshal([]byte(decrypted), &tags); err == nil {
			parsed.Decrypted = true
			parsed.Tags = make([]HistoryTag, 0, len(tags))

			// Process decrypted tags
			for _, tag := range tags {
				if len(tag) >= 2 {
					historyTag := HistoryTag{
						Name:  tag[0],
						Value: tag[1],
					}

					if len(tag) >= 3 {
						historyTag.Relay = tag[2]
					}

					if len(tag) >= 4 {
						historyTag.Marker = tag[3]
					}

					parsed.Tags = append(parsed.Tags, historyTag)

					// Extract specific tag values
					switch tag[0] {
					case "direction":
						parsed.Direction = tag[1]
					case "amount":
						if amt, err := strconv.Atoi(tag[1]); err == nil {
							parsed.Amount = amt
						}
					case "e":
						if len(tag) >= 4 {
							switch tag[3] {
							case "created":
								parsed.CreatedEvents = append(parsed.CreatedEvents, tag[1])
								requests = append(requests, types.Request{
									Kinds:      []int{7375},
									IDs:        []string{tag[1]},
									CacheFirst: true,
									Relays:     p.GetRelays(7375, event.PubKey),
								})
							case "destroyed":
								parsed.DestroyedEvents = append(parsed.DestroyedEvents, tag[1])
								requests = append(requests, types.Request{
									Kinds:      []int{7375},
									IDs:        []string{tag[1]},
									CacheFirst: true,
									Relays:     p.GetRelays(7375, event.PubKey),
								})
							case "redeemed":
								parsed.RedeemedEvents = append(parsed.RedeemedEvents, tag[1])
								requests = append(requests, types.Request{
									Kinds:      []int{7375},
									IDs:        []string{tag[1]},
									CacheFirst: true,
									Relays:     p.GetRelays(7375, event.PubKey),
								})
							}
						}
					}
				}
			}
		}
	}

	return parsed, &requests, nil
}

// PrepareKind7376 prepares a kind 7376 event for publishing by encrypting content and signing
func (p *Parser) PrepareKind7376(event *nostr.Event) error {
	if event.Kind != 7376 {
		return fmt.Errorf("event is not kind 7376")
	}

	// For spending history events, the content is an array of tags
	var tags [][]string
	if err := json.Unmarshal([]byte(event.Content), &tags); err != nil {
		return fmt.Errorf("invalid spending history content: %w", err)
	}

	// Check for required direction and amount tags
	var hasDirection, hasAmount bool
	for _, tag := range tags {
		if len(tag) >= 2 {
			if tag[0] == "direction" {
				hasDirection = true
				if tag[1] != "in" && tag[1] != "out" {
					return fmt.Errorf("direction must be 'in' or 'out'")
				}
			} else if tag[0] == "amount" {
				hasAmount = true
			}
		}
	}

	if !hasDirection || !hasAmount {
		return fmt.Errorf("spending history must include direction and amount")
	}

	// NIP-44 encrypt the content
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return fmt.Errorf("failed to marshal tags: %w", err)
	}

	currentSigner := p.Signer.Current

	if currentSigner == nil {
		return fmt.Errorf("no signer available for encryption")
	}

	pubkey, _ := currentSigner.GetPublicKey()

	encrypted, err := currentSigner.NIP44Encrypt(pubkey, string(tagsJSON))
	if err != nil {
		return fmt.Errorf("failed to encrypt tags: %w", err)
	}
	event.Content = encrypted

	// Sign the event
	return currentSigner.SignEvent(event)
}
