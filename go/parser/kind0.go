package parser

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind0Parsed represents a parsed kind 0 profile event
type Kind0Parsed struct {
	Pubkey      string `json:"pubkey,omitempty" msgpack:"pubkey,omitempty"`
	Name        string `json:"name,omitempty" msgpack:"name,omitempty"`
	DisplayName string `json:"display_name,omitempty" msgpack:"display_name,omitempty"`
	Picture     string `json:"picture,omitempty" msgpack:"picture,omitempty"`
	Banner      string `json:"banner,omitempty" msgpack:"banner,omitempty"`
	About       string `json:"about,omitempty" msgpack:"about,omitempty"`
	Website     string `json:"website,omitempty" msgpack:"website,omitempty"`
	Nip05       string `json:"nip05,omitempty" msgpack:"nip05,omitempty"`
	Lud06       string `json:"lud06,omitempty" msgpack:"lud06,omitempty"`
	Lud16       string `json:"lud16,omitempty" msgpack:"lud16,omitempty"`

	Github   string `json:"github,omitempty" msgpack:"github,omitempty"`
	Twitter  string `json:"twitter,omitempty" msgpack:"twitter,omitempty"`
	Mastodon string `json:"mastodon,omitempty" msgpack:"mastodon,omitempty"`
	Nostr    string `json:"nostr,omitempty" msgpack:"nostr,omitempty"`

	// Alternative formats
	DisplayNameAlt string `json:"displayName,omitempty" msgpack:"displayName,omitempty"`
	Username       string `json:"username,omitempty" msgpack:"username,omitempty"`
	Bio            string `json:"bio,omitempty" msgpack:"bio,omitempty"`
	Image          string `json:"image,omitempty" msgpack:"image,omitempty"`
	Avatar         string `json:"avatar,omitempty" msgpack:"avatar,omitempty"`
	Background     string `json:"background,omitempty" msgpack:"background,omitempty"`

	// CreatedAt int64 `json:"created_at,omitempty" msgpack:"created_at,omitempty"`

	// Custom fields stored in a map
	// CustomFields map[string]string `json:"-" msgpack:"-"`
}

// ProfilePointer represents NIP-05 information
type ProfilePointer struct {
	Pubkey string   `json:"pubkey"`
	Relays []string `json:"relays,omitempty"`
}

// NIP05Response represents the structure of a .well-known/nostr.json response
type NIP05Response struct {
	Names  map[string]string   `json:"names"`
	Relays map[string][]string `json:"relays,omitempty"`
}

// NIP05Regex matches valid NIP-05 identifiers (user@domain.com)
var NIP05Regex = regexp.MustCompile(`^(?:([a-zA-Z0-9._-]+)@)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$`)

// ParseKind0 parses a kind 0 event into a structured profile object
func (p *Parser) ParseKind0(event nostr.Event) (*Kind0Parsed, *[]types.Request, error) {

	if event.Kind != 0 {
		return nil, nil, nil
	}

	var profile Kind0Parsed
	profile.Pubkey = event.PubKey
	// Parse the content JSON
	if err := json.Unmarshal([]byte(event.Content), &profile); err != nil {
		return nil, nil, fmt.Errorf("failed to parse profile: %v, %s", err, event.Content)
	}

	// calling the http enpoint synchronously result in a deadlock, we need to handle it differently in go
	// If nip05 is present, try to query additional information
	// if profile.Nip05 != "" {
	// 	profilePointer, err := QueryNIP05(profile.Nip05)
	// 	if err != nil {
	// 		fmt.Printf("Failed to query nip05: %v\n", err)
	// 	} else if profilePointer != nil {
	// 		// if profilePointer != nil {
	// 		// 	profile.Relays = profilePointer.Relays
	// 		// 	profile.Image = profilePointer.Image
	// 		// 	profile.Avatar = profilePointer.Avatar
	// 		// 	profile.Background = profilePointer.Background
	// 		// }
	// 	}
	// }
	if len(profile.Name) == 0 && len(profile.DisplayName) > 0 {
		profile.Name = profile.DisplayName
	}

	return &profile, nil, nil
}

// QueryNIP05 queries a NIP-05 identifier to verify and retrieve additional profile information
func QueryNIP05(nip05 string) (*ProfilePointer, error) {
	matches := NIP05Regex.FindStringSubmatch(nip05)
	if matches == nil {
		return nil, nil
	}

	name := matches[1]
	if name == "" {
		name = "_"
	}
	domain := matches[2]

	url := fmt.Sprintf("https://proxy.nuts.cash/?url=%s/.well-known/nostr.json?name=%s", domain, name)

	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch NIP05 data: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("wrong response code: %d", resp.StatusCode)
	}

	var nip05Response NIP05Response
	if err := json.NewDecoder(resp.Body).Decode(&nip05Response); err != nil {
		return nil, fmt.Errorf("failed to decode NIP05 response: %v", err)
	}

	pubkey, exists := nip05Response.Names[name]
	if !exists {
		return nil, nil
	}

	return &ProfilePointer{
		Pubkey: pubkey,
		Relays: nip05Response.Relays[pubkey],
	}, nil
}
