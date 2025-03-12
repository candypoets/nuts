package parser

import (
	"fmt"
	"strings"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// RelayInfo represents a NIP-65 relay record
type RelayInfo struct {
	URL   string `json:"url"`
	Read  bool   `json:"read"`
	Write bool   `json:"write"`
}

// Kind10002Parsed represents parsed relay list data
type Kind10002Parsed []RelayInfo

// ParseKind10002 parses a kind 10002 (relay list) event
func (p *Parser) ParseKind10002(event nostr.Event) (*Kind10002Parsed, *[]types.Request, error) {
	if event.Kind != 10002 {
		return nil, nil, fmt.Errorf("event is nil or not kind 10002")
	}

	// Extract relay info from the r tags
	var relays []RelayInfo

	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "r" && tag[1] != "" {
			url := nostr.NormalizeURL(tag[1])
			if url == "" {
				continue
			}

			var marker string
			if len(tag) >= 3 {
				marker = strings.ToLower(tag[2])
			}

			// If no marker is provided, the relay is used for both read and write
			// If a marker is provided, it should be either "read", "write", or both
			relay := RelayInfo{
				URL:   url,
				Read:  marker == "" || marker == "read",
				Write: marker == "" || marker == "write",
			}

			relays = append(relays, relay)
		}
	}

	// Deduplicate relays by URL
	uniqueRelays := make(map[string]RelayInfo)
	for _, relay := range relays {
		uniqueRelays[relay.URL] = relay
	}

	// Convert map to slice
	result := make(Kind10002Parsed, 0, len(uniqueRelays))
	for _, relay := range uniqueRelays {
		result = append(result, relay)
	}

	return &result, nil, nil
}
