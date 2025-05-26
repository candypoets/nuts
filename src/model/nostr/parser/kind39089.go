package parser

import (
	"encoding/json"
	"fmt"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind30000Parsed represents a parsed categorized people list (NIP-51)
type Kind30000Parsed struct {
	ListIdentifier string   `json:"list_identifier" msgpack:"list_identifier"`
	People         []string `json:"people" msgpack:"people"`
	Title          string   `json:"title,omitempty" msgpack:"title,omitempty"`
	Description    string   `json:"description,omitempty" msgpack:"description,omitempty"`
	Image          string   `json:"image,omitempty" msgpack:"image,omitempty"`
}

// ParseKind30000 parses a kind 30000 (categorized people list) event
func (p *Parser) ParseKind30000(event nostr.Event) (*Kind30000Parsed, *[]types.Request, error) {
	var requests []types.Request

	result := &Kind30000Parsed{
		People: make([]string, 0),
	}

	// Find the "d" tag which contains the list identifier
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "d" {
			result.ListIdentifier = tag[1]
			break
		}
	}

	if result.ListIdentifier == "" {
		return nil, nil, fmt.Errorf("missing required 'd' tag for list identifier")
	}

	// Extract people from p tags
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "p" {
			result.People = append(result.People, tag[1])
		}
	}

	// Parse content for metadata if present
	if event.Content != "" {
		_ = json.Unmarshal([]byte(event.Content), &result)
	}

	// Check for title, description, or image tags
	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			switch tag[0] {
			case "title":
				result.Title = tag[1]
			case "description":
				result.Description = tag[1]
			case "image":
				result.Image = tag[1]
			}
		}
	}

	requests = append(requests, types.Request{
		Kinds:   []int{0, 10002}, // Kind 0 = profile metadata
		Authors: result.People,
	})

	return result, &requests, nil
}
