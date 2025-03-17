package parser

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// ReactionType represents the type of reaction
type ReactionType string

const (
	ReactionTypeLike    ReactionType = "+"
	ReactionTypeDislike ReactionType = "-"
	ReactionTypeEmoji   ReactionType = "emoji"
	ReactionTypeCustom  ReactionType = "custom"
)

// Emoji represents emoji data in a reaction
type Emoji struct {
	Shortcode string `json:"shortcode"`
	URL       string `json:"url"`
}

// Kind7Parsed represents a parsed reaction event
type Kind7Parsed struct {
	Type              ReactionType `json:"type" msgpack:"type"`
	EventID           string       `json:"eventId" msgpack:"eventId"`                                         // The id of the event being reacted to
	Pubkey            string       `json:"pubkey" msgpack:"pubkey"`                                           // The pubkey of the author of the reacted event
	EventKind         *int         `json:"eventKind,omitempty" msgpack:"eventKind,omitempty"`                 // The kind of the event being reacted to (from k tag)
	Emoji             *Emoji       `json:"emoji,omitempty" msgpack:"emoji,omitempty"`                         // Emoji data if this is an emoji reaction
	TargetCoordinates string       `json:"targetCoordinates,omitempty" msgpack:"targetCoordinates,omitempty"` // For addressable events (from a tag)
}

// ParseKind7 parses a kind 7 (reaction) event
func (p *Parser) ParseKind7(event nostr.Event) (*Kind7Parsed, *[]types.Request, error) {
	if event.Kind != 7 {
		return nil, nil, fmt.Errorf("event is not kind 7")
	}

	// Find the e tag for the target event (should be the last one if multiple)
	eTag := event.Tags.FindLast("e")
	if eTag == nil && len(eTag) >= 2 {
		return nil, nil, fmt.Errorf("reaction must have at least one e tag")
	}

	eventID := eTag[1]

	// Find pubkey tag (last p tag)
	pTag := event.Tags.FindLast("p")

	var pubkey string
	if pTag != nil && len(pTag) >= 2 {
		pubkey = pTag[1]
	}

	// Find kind tag
	var eventKind *int
	kTag := event.Tags.FindLast("k")
	if kTag != nil {
		if k, err := strconv.Atoi(kTag[1]); err == nil {
			eventKind = &k
		}
	}

	// Find addressable coordinates
	var targetCoordinates string
	aTag := event.Tags.FindLast("a")
	if aTag != nil && len(aTag) >= 2 {
		targetCoordinates = aTag[1]
	}

	// Parse reaction type
	var reactionType ReactionType
	content := event.Content

	switch {
	case content == "+" || content == "":
		reactionType = ReactionTypeLike
	case content == "-":
		reactionType = ReactionTypeDislike
	case strings.HasPrefix(content, ":") && strings.HasSuffix(content, ":"):
		reactionType = ReactionTypeEmoji
	default:
		reactionType = ReactionTypeCustom
	}

	// Parse emoji if present
	var emoji *Emoji
	if reactionType == ReactionTypeEmoji {
		parsedEmoji := parseEmojiContent(event)
		if parsedEmoji != nil {
			emoji = &Emoji{
				Shortcode: parsedEmoji.Shortcode,
				URL:       parsedEmoji.URL,
			}
		}
	}

	result := &Kind7Parsed{
		Type:              reactionType,
		EventID:           eventID,
		Pubkey:            pubkey,
		EventKind:         eventKind,
		Emoji:             emoji,
		TargetCoordinates: targetCoordinates,
	}

	return result, nil, nil
}

// Helper function to parse emoji content - similar to the parseEmojiContent in utils.ts
func parseEmojiContent(event nostr.Event) *Emoji {
	// Check if content is a shortcode format :emoji:
	content := event.Content
	if !strings.HasPrefix(content, ":") || !strings.HasSuffix(content, ":") {
		return nil
	}

	// Extract shortcode (remove the colons)
	shortcode := content[1 : len(content)-1]
	if shortcode == "" {
		return nil
	}

	// Find matching emoji tag
	for _, tag := range event.Tags {
		if len(tag) >= 3 && tag[0] == "emoji" && tag[1] == shortcode {
			return &Emoji{
				Shortcode: shortcode,
				URL:       tag[2],
			}
		}
	}

	return nil
}
