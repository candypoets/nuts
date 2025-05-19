package parser

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
	decodepay "github.com/nbd-wtf/ln-decodepay"
)

// INDEXER_RELAYS contains the relays used for indexing
var INDEXER_RELAYS = []string{} // Fill with your relay URLs from env

// ZapRequest represents the data structure of a zap request
type ZapRequest struct {
	Kind      int        `json:"kind" msgpack:"kind"`
	Pubkey    string     `json:"pubkey" msgpack:"pubkey"`
	Content   string     `json:"content" msgpack:"content"`
	Tags      [][]string `json:"tags" msgpack:"tags"`
	Signature string     `json:"sig" msgpack:"sig"`
}

// Kind9735Parsed represents parsed data from a kind 9735 event (zap receipt)
type Kind9735Parsed struct {
	ID              string          `json:"id" msgpack:"id"`
	Amount          int             `json:"amount" msgpack:"amount"`                                       // Amount in sats
	Content         string          `json:"content" msgpack:"content"`                                     // Content from the zap request
	Bolt11          string          `json:"bolt11" msgpack:"bolt11"`                                       // Lightning invoice
	Preimage        string          `json:"preimage,omitempty" msgpack:"preimage,omitempty"`               // Payment preimage (optional)
	Sender          string          `json:"sender" msgpack:"sender"`                                       // Pubkey of sender
	Recipient       string          `json:"recipient" msgpack:"recipient"`                                 // Pubkey of recipient
	Event           string          `json:"event,omitempty" msgpack:"event,omitempty"`                     // ID of the event being zapped (if any)
	EventCoordinate string          `json:"eventCoordinate,omitempty" msgpack:"eventCoordinate,omitempty"` // Event coordinate for addressable events (if any)
	Timestamp       nostr.Timestamp `json:"timestamp" msgpack:"timestamp"`                                 // When the zap was created
	Valid           bool            `json:"valid" msgpack:"valid"`                                         // Whether the zap appears valid
	Description     ZapRequest      `json:"description" msgpack:"description"`                             // The original zap request data
}

// ParseKind9735 parses a kind 9735 event (zap receipt)
func (p *Parser) ParseKind9735(event nostr.Event) (*Kind9735Parsed, *[]types.Request, error) {
	// Create the necessary request objects
	var requests = []types.Request{}
	if event.Kind != 9735 {
		return nil, nil, fmt.Errorf("event is not kind 9735")
	}

	// get the sender profile for this zap
	requests = append(requests, types.Request{
		Kinds:      []int{0},
		Authors:    []string{event.PubKey},
		CacheFirst: true,
		Relays:     p.GetRelays(0, event.PubKey),
	})

	// Extract tags
	var pTag, eTag, aTag, bolt11Tag, descriptionTag, preimageTag, senderTag []string

	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			switch tag[0] {
			case "p":
				pTag = tag
			case "e":
				eTag = tag
			case "a":
				aTag = tag
			case "bolt11":
				bolt11Tag = tag
			case "description":
				descriptionTag = tag
			case "preimage":
				preimageTag = tag
			case "P": // Capital P for sender
				senderTag = tag
			}
		}
	}

	// Require mandatory tags
	if pTag == nil || bolt11Tag == nil || descriptionTag == nil {
		return nil, nil, fmt.Errorf("missing required tags")
	}

	// Parse the zap request from the description tag
	var zapRequest ZapRequest
	err := json.Unmarshal([]byte(descriptionTag[1]), &zapRequest)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse zap request description: %w", err)
	}

	// Validate that the zap request is properly formed
	if zapRequest.Kind != 9734 || len(zapRequest.Tags) == 0 {
		return nil, nil, fmt.Errorf("invalid zap request")
	}

	// Extract amount from bolt11 invoice
	amount := 0

	// First check if there's an amount tag in the zap request
	var amountTag []string
	for _, tag := range zapRequest.Tags {
		if len(tag) >= 2 && tag[0] == "amount" {
			amountTag = tag
			break
		}
	}

	if amountTag != nil {
		// Parse amount from the tag (in millisats)
		if amtInt, err := strconv.ParseInt(amountTag[1], 10, 64); err == nil {
			amount = int(math.Round(float64(amtInt) / 1000.0))
		}
	} else {
		// Try to decode the bolt11 invoice to get the amount
		invoice, err := decodepay.Decodepay(bolt11Tag[1])
		if err == nil && invoice.MSatoshi > 0 {
			amount = int(math.Round(float64(invoice.MSatoshi) / 1000.0))
		}
	}

	// Determine sender
	sender := ""
	if senderTag != nil {
		sender = senderTag[1]
	} else {
		sender = zapRequest.Pubkey
	}

	// // Handle EOSE requests or fetch profile
	// if len(requests) > 0 && requests[0] != nil {
	// Extract the relay hints from the zap request
	relaysTagInRequest := findTag(zapRequest.Tags, "relays")
	var zapperRelayHints []string

	if relaysTagInRequest != nil && len(relaysTagInRequest) > 1 {
		zapperRelayHints = relaysTagInRequest[1:]
	}

	// try to find the zapper profile
	requests = append(requests, types.Request{
		Kinds:      []int{0},
		Authors:    []string{event.PubKey},
		Limit:      1,
		CacheFirst: true,
		Relays:     append(p.GetRelays(0, event.PubKey), zapperRelayHints...),
	})

	// Create the parsed zap receipt
	receipt := &Kind9735Parsed{
		ID:          event.ID,
		Amount:      amount,
		Content:     zapRequest.Content,
		Bolt11:      bolt11Tag[1],
		Sender:      sender,
		Recipient:   pTag[1],
		Timestamp:   event.CreatedAt,
		Valid:       true, // We'll validate below
		Description: zapRequest,
	}

	// Add optional fields
	if eTag != nil {
		receipt.Event = eTag[1]
	}
	if aTag != nil {
		receipt.EventCoordinate = aTag[1]
	}
	if preimageTag != nil {
		receipt.Preimage = preimageTag[1]
	}

	// Perform basic validation
	// 1. The zap request should have the same recipient as the receipt
	requestPTag := findTag(zapRequest.Tags, "p")
	if requestPTag == nil || requestPTag[1] != receipt.Recipient {
		receipt.Valid = false
	}

	// 2. If the receipt has an event ID, the request should also have it
	if receipt.Event != "" {
		requestETag := findTag(zapRequest.Tags, "e")
		if requestETag == nil || requestETag[1] != receipt.Event {
			receipt.Valid = false
		}
	}

	// 3. If the receipt has an event coordinate, the request should also have it
	if receipt.EventCoordinate != "" {
		requestATag := findTag(zapRequest.Tags, "a")
		if requestATag == nil || requestATag[1] != receipt.EventCoordinate {
			receipt.Valid = false
		}
	}

	// Note: Full validation would require:
	// - Verifying the zap request signature
	// - Checking that the lnurl in the request matches the recipient's lnurl
	// - Confirming the receipt issuer matches the recipient's nostrPubkey

	return receipt, &requests, nil
}

// Helper function to find a tag by name
func findTag(tags [][]string, name string) []string {
	for _, tag := range tags {
		if len(tag) >= 2 && tag[0] == name {
			return tag
		}
	}
	return nil
}
