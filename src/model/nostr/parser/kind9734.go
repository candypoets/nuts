package parser

import (
	"fmt"
	"strconv"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind9734Parsed holds the structured data extracted from a Kind 9734 (Zap Request) event.
type Kind9734Parsed struct {
	Zapper          string   `json:"zapper"`                     // Pubkey of the user sending the zap
	Recipient       string   `json:"recipient"`                  // Pubkey of the user receiving the zap (from 'p' tag)
	TargetEventID   string   `json:"target_event_id,omitempty"`  // Event ID being zapped (from 'e' tag, optional)
	AmountMillisats int64    `json:"amount_millisats,omitempty"` // Amount in millisatoshis (from 'amount' tag, optional)
	LNURL           string   `json:"lnurl,omitempty"`            // LNURL string used for the zap (from 'lnurl' tag, optional)
	Relays          []string `json:"relays"`
}

func (p *Parser) ParseKind9734(event nostr.Event) (*Kind9734Parsed, *[]types.Request, error) {
	var requests = []types.Request{}
	if event.Kind != nostr.KindZapRequest {
		return nil, nil, fmt.Errorf("event kind is not 9734 (Zap Request), got %d", event.Kind)
	}

	parsed := Kind9734Parsed{
		Zapper: event.PubKey,
	}

	var pTagFound, relaysTagFound bool

	for _, tag := range event.Tags {
		if len(tag) < 1 {
			continue // Invalid tag
		}
		switch tag[0] {
		case "p":
			if len(tag) >= 2 && nostr.IsValidPublicKey(tag[1]) {
				parsed.Recipient = tag[1]
				pTagFound = true
				requests = append(requests, types.Request{
					Kinds:      []int{0},
					Authors:    []string{tag[1]},
					CacheFirst: true,
					Relays:     p.GetRelays(0, tag[1]),
				})
			}
		case "e":
			if len(tag) >= 2 { // Could be note ID or nevent, just store the ID for now
				// For simplicity, assuming it's a hex ID. If it could be nevent1..., needs nip19 decoding
				parsed.TargetEventID = tag[1]
			}
		case "amount":
			if len(tag) >= 2 {
				amountMsat, err := strconv.ParseInt(tag[1], 10, 64)
				if err == nil {
					parsed.AmountMillisats = amountMsat
				} else {
					// p.log.Warn().Str("event_id", event.ID).Str("amount_tag", tag[1]).Err(err).Msg("Kind 9734: Failed to parse 'amount' tag")
				}
			}
		case "lnurl":
			if len(tag) >= 2 {
				parsed.LNURL = tag[1]
			}
		case "relays":
			if len(tag) > 1 { // Tag should be ["relays", "url1", "url2", ...]
				parsed.Relays = make([]string, 0, len(tag)-1)
				for i := 1; i < len(tag); i++ {
					// Basic validation could be added here (e.g., check if it looks like a wss URL)
					parsed.Relays = append(parsed.Relays, tag[i])
				}
				relaysTagFound = true
			}
		default:
			// Other tags can be ignored or collected if needed
		}
	}

	if !pTagFound {
		return nil, nil, fmt.Errorf("Kind 9734 (event %s): missing or invalid required 'p' (recipient) tag", event.ID)
	}
	if !relaysTagFound || len(parsed.Relays) == 0 {
		return nil, nil, fmt.Errorf("Kind 9734 (event %s): missing or invalid required 'relays' tag", event.ID)
	}

	return &parsed, &requests, nil
}
