package parser

import (
	"fmt"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind4Parsed represents the parsed data from a kind 4 (encrypted direct message) event
type Kind4Parsed struct {
	ParsedContent    []ContentBlock `json:"parsedContent,omitempty" msgpack:"parsedContent"`
	DecryptedContent string         `json:"decryptedContent,omitempty" msgpack:"decryptedContent"`
	ChatID           string         `json:"chatID" msgpack:"chatID"`
	Recipient        string         `json:"recipient" msgpack:"recipient"`
}

// ParseKind4 parses a kind 4 (encrypted direct message) event
func (p *Parser) ParseKind4(event nostr.Event) (*Kind4Parsed, *[]types.Request, error) {
	// Create the necessary request objects
	var requests = []types.Request{}

	if event.Kind != 4 {
		return nil, nil, fmt.Errorf("event is nil or not kind 4")
	}

	parsed := &Kind4Parsed{}

	// Get the recipient from the p tag
	recipient := ""
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "p" {
			recipient = tag[1]
			break
		}
	}

	if recipient == "" {
		return nil, nil, fmt.Errorf("no recipient found in DM")
	}

	parsed.Recipient = recipient

	// Request profile information for both sender and recipient
	requests = append(requests, types.Request{
		Kinds:      []int{0},
		Authors:    []string{event.PubKey},
		CacheFirst: true,
		Relays:     p.GetRelays(event),
	})

	requests = append(requests, types.Request{
		Kinds:      []int{0},
		Authors:    []string{recipient},
		CacheFirst: true,
		Relays:     p.GetRelays(event),
	})

	// Create a consistent chat ID by sorting the pubkeys
	chatParticipants := []string{event.PubKey, recipient}
	if event.PubKey > recipient {
		chatParticipants[0] = recipient
		chatParticipants[1] = event.PubKey
	}
	parsed.ChatID = fmt.Sprintf("%s_%s", chatParticipants[0], chatParticipants[1])

	// Try to decrypt the message
	if p.Signer != nil {
		var pubkey string
		pk, _ := p.Signer.GetPublicKey()
		println(fmt.Sprintf("Decrypting message with pk %s, from %s: %s\n", pk, event.PubKey, event.Content))
		if pk != "" {
			if pk == event.PubKey {
				pubkey = parsed.Recipient
			} else {
				pubkey = event.PubKey
			}
			decrypted, err := p.Signer.NIP04Decrypt(pubkey, event.Content)
			if err != nil {
				println(fmt.Sprintf("Error decrypting message: %s", err))
			}
			if decrypted != "" {
				parsed.DecryptedContent = decrypted

				// Parse the decrypted content
				parsedContent, err := ParseContent(decrypted)
				if err != nil {
					return nil, nil, fmt.Errorf("error parsing decrypted content: %w", err)
				}
				parsed.ParsedContent = parsedContent
			}
		}

	}

	return parsed, &requests, nil
}

func (p *Parser) PrepareKind4(event *nostr.Event) error {
	recipient := ""
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "p" {
			recipient = tag[1]
			break
		}
	}

	encrypted, err := p.Signer.NIP04Encrypt(recipient, event.Content)
	if err != nil {
		return fmt.Errorf("failed to encrypt event content: %w", err)
	}
	event.Content = encrypted

	err = p.Signer.SignEvent(event)

	if err != nil {
		return fmt.Errorf("failed to sign event: %w", err)
	}
	return nil
}
