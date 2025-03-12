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
	Name        string `json:"name,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	Picture     string `json:"picture,omitempty"`
	Banner      string `json:"banner,omitempty"`
	About       string `json:"about,omitempty"`
	Website     string `json:"website,omitempty"`
	Nip05       string `json:"nip05,omitempty"`
	Lud06       string `json:"lud06,omitempty"`
	Lud16       string `json:"lud16,omitempty"`

	Github   string `json:"github,omitempty"`
	Twitter  string `json:"twitter,omitempty"`
	Mastodon string `json:"mastodon,omitempty"`
	Nostr    string `json:"nostr,omitempty"`

	// Alternative formats
	DisplayNameAlt string `json:"displayName,omitempty"`
	Username       string `json:"username,omitempty"`
	Bio            string `json:"bio,omitempty"`
	Image          string `json:"image,omitempty"`
	Avatar         string `json:"avatar,omitempty"`
	Background     string `json:"background,omitempty"`

	// Custom fields stored in a map
	CustomFields map[string]string `json:"-"`
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
	profile.CustomFields = make(map[string]string)

	// Parse the content JSON
	var contentMap map[string]string
	if err := json.Unmarshal([]byte(event.Content), &contentMap); err != nil {
		return nil, nil, fmt.Errorf("failed to parse profile: %v", err)
	}

	// Map JSON fields to struct fields
	for key, value := range contentMap {
		switch key {
		case "name":
			profile.Name = value
		case "display_name":
			profile.DisplayName = value
		case "picture":
			profile.Picture = value
		case "banner":
			profile.Banner = value
		case "about":
			profile.About = value
		case "website":
			profile.Website = value
		case "nip05":
			profile.Nip05 = value
		case "lud06":
			profile.Lud06 = value
		case "lud16":
			profile.Lud16 = value
		case "github":
			profile.Github = value
		case "twitter":
			profile.Twitter = value
		case "mastodon":
			profile.Mastodon = value
		case "nostr":
			profile.Nostr = value
		case "displayName":
			profile.DisplayNameAlt = value
		case "username":
			profile.Username = value
		case "bio":
			profile.Bio = value
		case "image":
			profile.Image = value
		case "avatar":
			profile.Avatar = value
		case "background":
			profile.Background = value
		default:
			profile.CustomFields[key] = value
		}
	}

	// If nip05 is present, try to query additional information
	if profile.Nip05 != "" {
		profilePointer, err := QueryNIP05(profile.Nip05)
		if err != nil {
			fmt.Printf("Failed to query nip05: %v\n", err)
		} else if profilePointer != nil {
			// if profilePointer != nil {
			// 	profile.Relays = profilePointer.Relays
			// 	profile.Image = profilePointer.Image
			// 	profile.Avatar = profilePointer.Avatar
			// 	profile.Background = profilePointer.Background
			// }
		}
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
