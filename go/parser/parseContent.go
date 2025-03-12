package parser

import (
	"regexp"
	"sort"
	"strings"

	"github.com/nbd-wtf/go-nostr/nip19"
)

// ContentBlock represents a parsed block of content
type ContentBlock struct {
	Type string                 `json:"type"`
	Text string                 `json:"text"`
	Data map[string]interface{} `json:"data,omitempty"`
}

// Pattern defines a regex pattern and a processor function for content parsing
type Pattern struct {
	Type         string
	Regex        *regexp.Regexp
	ProcessMatch func([]string) (ContentBlock, error)
}

// Match represents a matched pattern in the content with position info
type Match struct {
	Start int
	End   int
	Block ContentBlock
}

// GetLinkPreview is a placeholder for the link preview functionality
// You can implement this later using an appropriate Go library
func GetLinkPreview(url string) (map[string]interface{}, error) {
	// Placeholder - return minimal preview data
	return map[string]interface{}{
		"url":         url,
		"title":       "Link Preview",
		"description": "Link preview not implemented",
	}, nil
}

// ParseContent parses a string content into ContentBlocks
func ParseContent(content string) ([]ContentBlock, error) {
	// Define patterns to match
	patterns := []Pattern{
		{
			Type:  "code",
			Regex: regexp.MustCompile("```([\\s\\S]*?)```"),
			ProcessMatch: func(match []string) (ContentBlock, error) {
				return ContentBlock{
					Type: "code",
					Text: match[0],
					Data: map[string]interface{}{
						"code": match[1],
					},
				}, nil
			},
		},
		{
			Type:  "cashu",
			Regex: regexp.MustCompile("(cashuA[A-Za-z0-9_-]+)"),
			ProcessMatch: func(match []string) (ContentBlock, error) {
				return ContentBlock{
					Type: "cashu",
					Text: match[0],
					Data: map[string]interface{}{
						"token": match[0],
					},
				}, nil
			},
		},
		{
			Type:  "hashtag",
			Regex: regexp.MustCompile(`(?<![^\s"'(])(#[a-zA-Z0-9_]+)(?![a-zA-Z0-9_])`),
			ProcessMatch: func(match []string) (ContentBlock, error) {
				return ContentBlock{
					Type: "hashtag",
					Text: match[0],
					Data: map[string]interface{}{
						"tag": match[0][1:], // Remove the # symbol
					},
				}, nil
			},
		},
		{
			Type:  "image",
			Regex: regexp.MustCompile(`(?i)(https?://\S+\.(jpg|jpeg|png|gif|webp|svg|ico)(\?\S*)?)`),
			ProcessMatch: func(match []string) (ContentBlock, error) {
				return ContentBlock{
					Type: "image",
					Text: match[0],
					Data: map[string]interface{}{
						"src": match[0],
					},
				}, nil
			},
		},
		{
			Type:  "video",
			Regex: regexp.MustCompile(`(?i)(https?://\S+\.(mp4|mov|avi|mkv|webm|m4v)(\?\S*)?)`),
			ProcessMatch: func(match []string) (ContentBlock, error) {
				return ContentBlock{
					Type: "video",
					Text: match[0],
					Data: map[string]interface{}{
						"src": match[0],
					},
				}, nil
			},
		},
		{
			Type:  "nostr",
			Regex: regexp.MustCompile(`(?i)nostr:([a-z0-9]+)`),
			ProcessMatch: func(match []string) (ContentBlock, error) {
				entity := match[1]

				prefix, data, err := nip19.Decode(entity)
				if err != nil {
					// If we can't decode, treat as text
					return ContentBlock{
						Type: "text",
						Text: match[0],
					}, nil
				}

				return ContentBlock{
					Type: prefix, // Will be "npub", "nprofile", "note", "nevent", "naddr"
					Text: match[0],
					Data: map[string]interface{}{
						"decoded": data,
						"bech32":  entity,
					},
				}, nil
			},
		},
		{
			Type:  "link",
			Regex: regexp.MustCompile(`(?i)(https?://\S+)(?!\[\)])`),
			ProcessMatch: func(match []string) (ContentBlock, error) {
				url := match[0]
				if !strings.HasPrefix(strings.ToLower(url), "http") {
					url = "https://" + url
				}

				// Placeholder for link preview
				preview, err := GetLinkPreview("https://proxy.nuts.cash/?url=" + url)
				if err != nil {
					preview = map[string]interface{}{}
				}

				return ContentBlock{
					Type: "link",
					Text: match[0],
					Data: map[string]interface{}{
						"href":    match[0],
						"preview": preview,
					},
				}, nil
			},
		},
	}

	// Find all matches with their positions
	var allMatches []Match

	for _, pattern := range patterns {
		// Find all matches for this pattern
		matches := pattern.Regex.FindAllStringSubmatchIndex(content, -1)

		for _, matchIndices := range matches {
			start := matchIndices[0]
			end := matchIndices[1]

			// Extract the matched text and subgroups
			matchText := content[start:end]
			submatches := []string{matchText}

			// Extract capture groups
			for i := 1; i < len(matchIndices)/2; i++ {
				if matchIndices[2*i] != -1 {
					submatches = append(submatches, content[matchIndices[2*i]:matchIndices[2*i+1]])
				} else {
					submatches = append(submatches, "")
				}
			}

			// Process the match
			block, err := pattern.ProcessMatch(submatches)
			if err != nil {
				continue
			}

			allMatches = append(allMatches, Match{
				Start: start,
				End:   end,
				Block: block,
			})
		}
	}

	// Sort matches by start position
	sort.Slice(allMatches, func(i, j int) bool {
		return allMatches[i].Start < allMatches[j].Start
	})

	// Remove overlapping matches (prioritize earlier patterns)
	var filteredMatches []Match

	for _, match := range allMatches {
		overlaps := false

		for _, existing := range filteredMatches {
			if (match.Start >= existing.Start && match.Start < existing.End) ||
				(match.End > existing.Start && match.End <= existing.End) ||
				(match.Start <= existing.Start && match.End >= existing.End) {
				overlaps = true
				break
			}
		}

		if !overlaps {
			filteredMatches = append(filteredMatches, match)
		}
	}

	// Re-sort filtered matches
	sort.Slice(filteredMatches, func(i, j int) bool {
		return filteredMatches[i].Start < filteredMatches[j].Start
	})

	// Build the final result, including text between matches
	var blocks []ContentBlock
	lastIndex := 0

	for _, match := range filteredMatches {
		// Add text before this match
		if match.Start > lastIndex {
			blocks = append(blocks, ContentBlock{
				Type: "text",
				Text: content[lastIndex:match.Start],
			})
		}

		// Add the match
		blocks = append(blocks, match.Block)

		lastIndex = match.End
	}

	// Add any remaining text after the last match
	if lastIndex < len(content) {
		blocks = append(blocks, ContentBlock{
			Type: "text",
			Text: content[lastIndex:],
		})
	}

	// Post-processing: group consecutive media into grids
	var processedBlocks []ContentBlock
	var mediaGroup []ContentBlock

	for i := 0; i < len(blocks); i++ {
		block := blocks[i]

		// If this is an image or video
		if block.Type == "image" || block.Type == "video" {
			mediaGroup = append(mediaGroup, block)
			continue
		}

		// If this is whitespace or newlines between media, check what follows
		if block.Type == "text" {
			isWhitespace := true
			for _, r := range block.Text {
				if !strings.ContainsRune(" \t\n\r", r) {
					isWhitespace = false
					break
				}
			}

			if isWhitespace {
				// If we have media before and media after, continue collecting
				if len(mediaGroup) > 0 && i+1 < len(blocks) {
					nextBlock := blocks[i+1]
					if nextBlock.Type == "image" || nextBlock.Type == "video" {
						continue
					}
				}
			}
		}

		// If we have collected media and the current block breaks the sequence
		if len(mediaGroup) > 0 {
			// Add media group if it contains more than one item
			if len(mediaGroup) > 1 {
				mediaTexts := make([]string, len(mediaGroup))
				mediaItems := make([]map[string]interface{}, len(mediaGroup))

				for j, media := range mediaGroup {
					mediaTexts[j] = media.Text
					mediaItems[j] = map[string]interface{}{
						"type": media.Type,
						"src":  media.Data["src"],
					}
				}

				processedBlocks = append(processedBlocks, ContentBlock{
					Type: "mediaGrid",
					Text: strings.Join(mediaTexts, "\n"),
					Data: map[string]interface{}{
						"items": mediaItems,
					},
				})
			} else {
				// Just add the single media item
				processedBlocks = append(processedBlocks, mediaGroup[0])
			}
			mediaGroup = nil
		}

		// Add the current non-media block
		processedBlocks = append(processedBlocks, block)
	}

	// Don't forget any remaining media
	if len(mediaGroup) > 0 {
		if len(mediaGroup) > 1 {
			mediaTexts := make([]string, len(mediaGroup))
			mediaItems := make([]map[string]interface{}, len(mediaGroup))

			for j, media := range mediaGroup {
				mediaTexts[j] = media.Text
				mediaItems[j] = map[string]interface{}{
					"type": media.Type,
					"src":  media.Data["src"],
				}
			}

			processedBlocks = append(processedBlocks, ContentBlock{
				Type: "mediaGrid",
				Text: strings.Join(mediaTexts, "\n"),
				Data: map[string]interface{}{
					"items": mediaItems,
				},
			})
		} else {
			processedBlocks = append(processedBlocks, mediaGroup[0])
		}
	}

	return processedBlocks, nil
}
