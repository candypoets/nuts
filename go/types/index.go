package types

import "github.com/nbd-wtf/go-nostr"

// Request represents a subscription request
type Request struct {
	// Filter fields with both JSON and MessagePack tags
	IDs     []string            `json:"ids,omitempty" msgpack:"ids,omitempty"`
	Authors []string            `json:"authors,omitempty" msgpack:"authors,omitempty"`
	Kinds   []int               `json:"kinds,omitempty" msgpack:"kinds,omitempty"`
	Tags    map[string][]string `json:"tags,omitempty" msgpack:"tags,omitempty"`
	Since   *nostr.Timestamp    `json:"since,omitempty" msgpack:"since,omitempty"`
	Until   *nostr.Timestamp    `json:"until,omitempty" msgpack:"until,omitempty"`
	Limit   int                 `json:"limit,omitempty" msgpack:"limit,omitempty"`
	Search  string              `json:"search,omitempty" msgpack:"search,omitempty"`
	Relays  []string            `json:"relays" msgpack:"relays"`
}

// NewRequest creates a new subscription request with the provided relays and filters
func NewRequest(relays []string, filter nostr.Filter) Request {
	return Request{
		Relays:  relays,
		IDs:     filter.IDs,
		Authors: filter.Authors,
		Kinds:   filter.Kinds,
		Tags:    filter.Tags,
		Since:   filter.Since,
		Until:   filter.Until,
		Limit:   filter.Limit,
		Search:  filter.Search,
	}
}
