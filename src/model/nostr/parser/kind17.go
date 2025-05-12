package parser

import (
	"fmt"
	"strings"

	"github.com/candypoets/nutscash/nostr/types"
	"github.com/nbd-wtf/go-nostr"
)

// Kind17Parsed represents a parsed reaction event to a URL/website
type Kind17Parsed = Kind7Parsed // Reusing Kind7Parsed type as per the TypeScript implementation

// ParseKind17 parses a kind 17 (website reaction) event
func (p *Parser) ParseKind17(event nostr.Event) (*Kind17Parsed, *[]types.Request, error) {
	if event.Kind != 17 {
		return nil, nil, fmt.Errorf("event is not kind 17")
	}

	// Find the r tag for the URL being reacted to
	var rTag []string
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == "r" {
			rTag = tag
			break
		}
	}

	if rTag == nil {
		return nil, nil, fmt.Errorf("kind 17 must have an r tag")
	}

	// Parse reaction type
	var reactionType ReactionType
	content := event.Content

	switch {
	case content == "+":
		reactionType = ReactionTypeLike
	case content == "-":
		reactionType = ReactionTypeDislike
	case strings.HasPrefix(content, ":"):
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

	result := &Kind17Parsed{
		Type:    reactionType,
		EventID: "", // No event ID for website reactions
		Pubkey:  "", // No pubkey for website reactions
		Emoji:   emoji,
	}

	return result, nil, nil
}
