package parser

import (
	"encoding/json"
	"fmt"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// Proof represents a Cashu token proof
type Proof struct {
	Amount  int    `json:"amount" msgpack:"amount"`
	Id      string `json:"id,omitempty" msgpack:"id,omitempty"`
	Secret  string `json:"secret,omitempty" msgpack:"secret,omitempty"`
	C       string `json:"C,omitempty" msgpack:"C,omitempty"`
	Script  string `json:"script,omitempty" msgpack:"script,omitempty"`
	Witness string `json:"witness,omitempty" msgpack:"witness,omitempty"`
}

// Kind9321Parsed represents parsed data from a kind 9321 event (nutzap)
type Kind9321Parsed struct {
	Amount    int     `json:"amount" msgpack:"amount"`
	Recipient string  `json:"recipient" msgpack:"recipient"`
	EventID   string  `json:"eventId,omitempty" msgpack:"eventId,omitempty"` // event being zapped if any
	MintURL   string  `json:"mintUrl" msgpack:"mintUrl"`                     // mint for the proofs
	Redeemed  bool    `json:"redeemed" msgpack:"redeemed"`                   // Default to not redeemed, will check later if needed
	Proofs    []Proof `json:"proofs" msgpack:"proofs"`
}

// ParseKind9321 parses a kind 9321 event (nutzap)
func (p *Parser) ParseKind9321(event nostr.Event) (*Kind9321Parsed, *[]types.Request, error) {
	// Create the necessary request objects
	var requests = []types.Request{}
	if event.Kind != 9321 {
		return nil, nil, fmt.Errorf("event is not kind 9321")
	}

	// get the sender profile for this zap
	requests = append(requests, types.Request{
		Kinds:      []int{0},
		Authors:    []string{event.PubKey},
		CacheFirst: true,
		Relays:     p.GetRelays(event),
	})

	// Extract required tags
	var proofTags [][]string
	var mintTag, recipientTag, eventTag []string

	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			if tag[0] == "proof" {
				proofTags = append(proofTags, tag)
			} else if tag[0] == "u" && mintTag == nil {
				mintTag = tag
			} else if tag[0] == "p" && recipientTag == nil {
				recipientTag = tag
			} else if tag[0] == "e" && eventTag == nil {
				eventTag = tag
			}
		}
	}

	// Validate essential tags are present
	if len(proofTags) == 0 || mintTag == nil || recipientTag == nil {
		return nil, nil, fmt.Errorf("missing required tags")
	}

	// Parse nutzap information
	total := 0
	proofs := make([]Proof, 0, len(proofTags))

	for _, proofTag := range proofTags {
		// Try to extract amount from the proof
		var proofData Proof
		err := json.Unmarshal([]byte(proofTag[1]), &proofData)
		if err != nil {
			// Just log the error and continue
			fmt.Printf("Failed to parse proof JSON: %v\n", err)
			continue
		}

		total += proofData.Amount
		proofs = append(proofs, proofData)
	}
	// try to find receipt event from the recipient
	requests = append(requests, types.Request{
		Kinds: []int{7376},
		Tags: map[string][]string{
			"#e": {event.ID},
		},
		Authors:    []string{recipientTag[1]},
		Limit:      1,
		CacheFirst: true,
		Relays:     p.GetRelays(event),
	})

	// Create the parsed result
	result := &Kind9321Parsed{
		Amount:    total,
		Recipient: recipientTag[1],
		MintURL:   mintTag[1],
		Proofs:    proofs,
		Redeemed:  false, // Default to not redeemed, will check later if needed
	}

	// Add eventId if present
	if eventTag != nil {
		result.EventID = eventTag[1]
	}

	return result, &requests, nil
}
