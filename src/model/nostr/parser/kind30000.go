package parser

import (
	"encoding/json"
	"fmt"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// ListMetadata represents the metadata for a categorized people list
type ListMetadata struct {
	Title       string `json:"title,omitempty" msgpack:"title,omitempty"`
	Description string `json:"description,omitempty" msgpack:"description,omitempty"`
	Image       string `json:"image,omitempty" msgpack:"image,omitempty"`
}

// Kind30000Parsed represents a parsed categorized people list (NIP-51)
type Kind30000Parsed struct {
	ListIdentifier string       `json:"list_identifier" msgpack:"list_identifier"`
	People        []string     `json:"people" msgpack:"people"`
	Metadata      ListMetadata `json:"metadata" msgpack:"metadata"`
}

// ParseKind30000 parses a kind 30000 (categorized people list) event
func (p *Parser) ParseKind30000(event nostr.Event) (*Kind30000Parsed, *[]types.Request, error) {
	if event.Kind != 30000 {
		return nil, nil, fmt.Errorf("event is not kind 30000")
	}

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
		var metadata ListMetadata
		if err := json.Unmarshal([]byte(event.Content), &metadata); err == nil {
			result.Metadata = metadata
		}
	}

	return result, nil, nil
}