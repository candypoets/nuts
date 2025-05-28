package types

import (
	"encoding/json"

	"github.com/nbd-wtf/go-nostr"
	"github.com/vmihailenco/msgpack/v5"
)

// Request represents a subscription request
type Request struct {
	// Filter fields with both JSON and MessagePack tags
	IDs         []string         `json:"ids,omitempty" msgpack:"ids,omitempty"`
	Authors     []string         `json:"authors,omitempty" msgpack:"authors,omitempty"`
	Kinds       []int            `json:"kinds,omitempty" msgpack:"kinds,omitempty"`
	Tags        nostr.TagMap     `json:"tags,omitempty" msgpack:"tags,omitempty"`
	Since       *nostr.Timestamp `json:"since,omitempty" msgpack:"since,omitempty"`
	Until       *nostr.Timestamp `json:"until,omitempty" msgpack:"until,omitempty"`
	Limit       int              `json:"limit,omitempty" msgpack:"limit,omitempty"`
	Search      string           `json:"search,omitempty" msgpack:"search,omitempty"`
	Relays      []string         `json:"relays" msgpack:"relays"`
	CloseOnEOSE bool             `json:"closeOnEOSE,omitempty" msgpack:"closeOnEOSE,omitempty"`
	CacheFirst  bool             `json:"cacheFirst,omitempty" msgpack:"cacheFirst,omitempty"`
	NoOptimize  bool             `json:"noOptimize,omitempty" msgpack:"noOptimize,omitempty"`
}

// ToFilter converts a Request to a nostr.Filter
func (r Request) ToFilter() nostr.Filter {
	return nostr.Filter{
		IDs:     r.IDs,
		Authors: r.Authors,
		Kinds:   r.Kinds,
		Tags:    r.Tags,
		Since:   r.Since,
		Until:   r.Until,
		Limit:   r.Limit,
		Search:  r.Search,
	}
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

// ParsedEvent represents a Nostr event with additional parsed data
type ParsedEvent struct {
	nostr.Event
	Parsed   any        `json:"parsed,omitempty"`
	Requests *[]Request `json:"requests,omitempty"`
	Relays   []string   `json:"relays,omitempty"`
}

// Custom JSON marshaler to properly format the output
func (pe ParsedEvent) MarshalJSON() ([]byte, error) {
	// Create an anonymous struct with proper JSON tags
	return json.Marshal(struct {
		ID        string          `json:"id"`
		PubKey    string          `json:"pubkey"`
		CreatedAt nostr.Timestamp `json:"created_at"`
		Kind      int             `json:"kind"`
		Tags      nostr.Tags      `json:"tags"`
		Content   string          `json:"content"`
		Sig       string          `json:"sig"`
		Parsed    any             `json:"parsed,omitempty"`
		Requests  *[]Request      `json:"requests,omitempty"`
		Relays    []string        `json:"relays,omitempty"`
	}{
		ID:        pe.ID,
		PubKey:    pe.PubKey,
		CreatedAt: pe.CreatedAt,
		Kind:      pe.Kind,
		Tags:      pe.Tags,
		Content:   pe.Content,
		Sig:       pe.Sig,
		Parsed:    pe.Parsed,
		Requests:  pe.Requests,
		Relays:    pe.Relays,
	})
}

// Custom MessagePack marshaler to properly format the output
func (pe ParsedEvent) EncodeMsgpack(enc *msgpack.Encoder) error {
	// Create an anonymous struct with MessagePack tags
	return enc.Encode(struct {
		ID        string          `msgpack:"id"`
		PubKey    string          `msgpack:"pubkey"`
		CreatedAt nostr.Timestamp `msgpack:"created_at"`
		Kind      int             `msgpack:"kind"`
		Tags      nostr.Tags      `msgpack:"tags"`
		Content   string          `msgpack:"content"`
		Sig       string          `msgpack:"sig"`
		Parsed    any             `msgpack:"parsed,omitempty"`
		Requests  *[]Request      `msgpack:"requests,omitempty"`
		Relays    []string        `msgpack:"relays,omitempty"`
	}{
		ID:        pe.ID,
		PubKey:    pe.PubKey,
		CreatedAt: pe.CreatedAt,
		Kind:      pe.Kind,
		Tags:      pe.Tags,
		Content:   pe.Content,
		Sig:       pe.Sig,
		Parsed:    pe.Parsed,
		Requests:  pe.Requests,
		Relays:    pe.Relays,
	})
}
