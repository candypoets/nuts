package parser

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/candypoets/nutscash/types"
	"github.com/elnosh/gonuts/cashu"
	"github.com/nbd-wtf/go-nostr"
)

// Kind9321Parsed represents parsed data from a kind 9321 event (nutzap)
type Kind9321Parsed struct {
	Amount       int                `json:"amount" msgpack:"amount"`
	Recipient    string             `json:"recipient" msgpack:"recipient"`
	EventID      string             `json:"eventId,omitempty" msgpack:"eventId,omitempty"`       // event being zapped if any
	MintURL      string             `json:"mintUrl" msgpack:"mintUrl"`                           // mint for the proofs
	Redeemed     bool               `json:"redeemed" msgpack:"redeemed"`                         // Whether the zap has been redeemed
	Proofs       []types.ProofUnion `json:"proofs" msgpack:"proofs"`                             // Using ProofUnion to handle both Proof and ProofV4
	Comment      string             `json:"comment,omitempty" msgpack:"comment,omitempty"`       // Optional comment from the sender
	IsP2PKLocked bool               `json:"isP2PKLocked" msgpack:"isP2PKLocked"`                 // Whether the proofs are properly P2PK-locked
	P2PKPubkey   string             `json:"p2pkPubkey,omitempty" msgpack:"p2pkPubkey,omitempty"` // The P2PK pubkey detected in the proofs
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
				// Get recipient profile
				requests = append(requests, types.Request{
					Kinds:      []int{0},
					Authors:    []string{recipientTag[1]},
					CacheFirst: true,
					Relays:     p.GetRelays(event),
				})
				// try to find receipt event from the recipient
				var relays []string
				walletRelays, exist := p.DB.QueryEvent(nostr.Filter{Kinds: []int{10019}, Authors: []string{event.PubKey}})
				walletRelaysParsed, ok := walletRelays.Parsed.(*Kind10019Parsed)
				if exist && ok {
					relays = append(relays, walletRelaysParsed.ReadRelays...)
				}
				requests = append(requests, types.Request{
					Kinds: []int{7376},
					Tags: map[string][]string{
						"#e": {event.ID},
					},
					Authors:    []string{recipientTag[1]},
					Limit:      1,
					CacheFirst: true,
					Relays:     relays,
				})

			} else if tag[0] == "e" && eventTag == nil {
				eventTag = tag
				requests = append(requests, types.Request{
					Kinds:      []int{1},
					IDs:        []string{eventTag[1]},
					CacheFirst: true,
					Relays:     p.GetRelays(event),
				})
			}
		}
	}

	// Validate essential tags are present
	if len(proofTags) == 0 || mintTag == nil || recipientTag == nil {
		return nil, nil, fmt.Errorf("missing required tags")
	}

	// Parse nutzap information
	total := 0
	proofs := make([]types.ProofUnion, 0, len(proofTags))
	isP2PKLocked := false
	var p2pkPubkey string

	for _, proofTag := range proofTags {
		// Try to extract proof from the tag
		var proofUnion types.ProofUnion
		if err := json.Unmarshal([]byte(proofTag[1]), &proofUnion); err != nil {
			// Just log the error and continue
			fmt.Printf("Failed to parse proof JSON: %v\n", err)
			continue
		}

		// Get amount based on proof type
		var amount int
		var secretStr string

		// Get the actual proof data (could be Proof or ProofV4)
		actualProof := proofUnion.GetProof() // Assume this method returns the underlying proof interface{}

		switch p := actualProof.(type) {
		case cashu.Proof: // Handle V3 Proof type
			amount = int(p.Amount) // Cast uint64 to int
			secretStr = p.Secret
		case cashu.ProofV4: // Handle V4 Proof type
			amount = int(p.Amount) // Cast uint64 to int
			secretStr = p.Secret   // Assuming V4 also has Amount and Secret fields with these names
		case map[string]any: // Fallback if GetProof returns a map (e.g., if ProofUnion wasn't fully hydrated)
			fmt.Println("GetProof returned map[string]interface{}, attempting map access")
			if amt, exists := p["amount"]; exists {
				switch v := amt.(type) {
				case float64:
					amount = int(v)
				case int:
					amount = v
				case json.Number:
					if intVal, err := v.Int64(); err == nil {
						amount = int(intVal)
					} else {
						fmt.Printf("Fallback: Failed to convert json.Number amount: %v\n", err)
					}
				default:
					fmt.Printf("Fallback: Unexpected type for amount: %T\n", v)
				}
			} else {
				fmt.Printf("Fallback: Proof map does not contain 'amount' key.\n")
			}
			// Attempt to get secret from map as well
			if secret, exists := p["secret"]; exists {
				if s, ok := secret.(string); ok {
					secretStr = s
				}
			}
		default:
			// Handle unexpected type from GetProof()
			fmt.Printf("Unexpected proof type from GetProof(): %T\n", p)
		}

		total += amount
		proofs = append(proofs, proofUnion)

		// Check if this proof is P2PK-locked using the extracted secretStr
		if secretStr != "" && strings.Contains(secretStr, "P2PK") {
			isP2PKLocked = true // Mark zap as P2PK if at least one proof is

			// Try to extract the pubkey only if we haven't found one yet for the whole zap
			if p2pkPubkey == "" {
				var secretData []interface{}
				// Use json.Unmarshal on the secret string
				if err := json.Unmarshal([]byte(secretStr), &secretData); err == nil {
					// Expected format: ["P2PK", {"data": "<pubkey>", ...}]
					if len(secretData) >= 2 {
						if label, ok := secretData[0].(string); ok && label == "P2PK" {
							if dataMap, ok := secretData[1].(map[string]interface{}); ok {
								if dataStr, ok := dataMap["data"].(string); ok {
									p2pkPubkey = dataStr // Store the first valid pubkey found
								}
							}
						}
					}
				} else {
					fmt.Printf("Failed to unmarshal P2PK secret string '%s': %v\n", secretStr, err)
				}
			}
		}
	}

	// Create the parsed result
	result := &Kind9321Parsed{
		Amount:       total,
		Recipient:    recipientTag[1],
		MintURL:      mintTag[1],
		Proofs:       proofs,
		Redeemed:     false, // Default to not redeemed, will check later
		Comment:      event.Content,
		IsP2PKLocked: isP2PKLocked,
		P2PKPubkey:   p2pkPubkey,
	}

	// Add eventId if present
	if eventTag != nil {
		result.EventID = eventTag[1]
	}

	return result, &requests, nil
}

// PrepareKind9321 prepares a kind 9321 event for publishing
func (p *Parser) PrepareKind9321(event *nostr.Event) error {
	if event.Kind != 9321 {
		return fmt.Errorf("event is not kind 9321")
	}

	// Validate required tags
	var hasProof, hasMint, hasRecipient bool

	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			if tag[0] == "proof" {
				hasProof = true
			} else if tag[0] == "u" {
				hasMint = true
			} else if tag[0] == "p" {
				hasRecipient = true
			}
		}
	}

	if !hasProof {
		return fmt.Errorf("kind 9321 must include at least one proof tag")
	}

	if !hasMint {
		return fmt.Errorf("kind 9321 must include a u tag with mint URL")
	}

	if !hasRecipient {
		return fmt.Errorf("kind 9321 must include a p tag with recipient")
	}

	// Sign the event
	return p.Signer.SignEvent(event)
}
