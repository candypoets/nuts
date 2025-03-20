package parser

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestParseContent(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected []ContentBlock
	}{
		{
			name:    "Plain text",
			content: "This is just plain text",
			expected: []ContentBlock{
				{Type: "text", Text: "This is just plain text"},
			},
		},
		{
			name:    "Code block",
			content: "Here is some code: ```var x = 10;``` and more text",
			expected: []ContentBlock{
				{Type: "text", Text: "Here is some code: "},
				{Type: "code", Text: "```var x = 10;```", Data: map[string]interface{}{"code": "var x = 10;"}},
				{Type: "text", Text: " and more text"},
			},
		},
		{
			name:    "Cashu token",
			content: "Here's some cash: cashuAEYSAQEx0QsgEavM8H6ZxWSJFSl6UPmSVCX0C1oO5AqXXU5vNoD5zbQUJQECBEDYzYYYHkCJJYUGQdq9TEZpJo",
			expected: []ContentBlock{
				{Type: "text", Text: "Here's some cash: "},
				{
					Type: "cashu",
					Text: "cashuAEYSAQEx0QsgEavM8H6ZxWSJFSl6UPmSVCX0C1oO5AqXXU5vNoD5zbQUJQECBEDYzYYYHkCJJYUGQdq9TEZpJo",
					Data: map[string]interface{}{
						"token": "cashuAEYSAQEx0QsgEavM8H6ZxWSJFSl6UPmSVCX0C1oO5AqXXU5vNoD5zbQUJQECBEDYzYYYHkCJJYUGQdq9TEZpJo",
					},
				},
			},
		},
		{
			name:    "Hashtag",
			content: "I love #bitcoin and #lightning",
			expected: []ContentBlock{
				{Type: "text", Text: "I love "},
				{Type: "hashtag", Text: "#bitcoin", Data: map[string]interface{}{"tag": "bitcoin"}},
				{Type: "text", Text: " and "},
				{Type: "hashtag", Text: "#lightning", Data: map[string]interface{}{"tag": "lightning"}},
			},
		},
		{
			name: "Image URLs",
			content: `	⚡️ MORE - Physical #Bitcoin exchange spotted in Bolivia 🇧🇴
https://m.primal.net/PlWm.jpg`,
			expected: []ContentBlock{
				{Type: "text", Text: "	⚡️ MORE - Physical "},
				{Type: "hashtag", Text: "#Bitcoin", Data: map[string]interface{}{"tag": "Bitcoin"}},
				{Type: "text", Text: " exchange spotted in Bolivia 🇧🇴\n"},
				{Type: "image", Text: "https://m.primal.net/PlWm.jpg", Data: map[string]interface{}{
					"src": "https://m.primal.net/PlWm.jpg",
				}},
			},
		},
		{
			name:    "Video URL",
			content: "Watch this: https://example.com/video.mp4",
			expected: []ContentBlock{
				{Type: "text", Text: "Watch this: "},
				{Type: "video", Text: "https://example.com/video.mp4", Data: map[string]interface{}{"src": "https://example.com/video.mp4"}},
			},
		},
		{
			name:    "Regular link",
			content: "Visit https://example.com for more",
			expected: []ContentBlock{
				{Type: "text", Text: "Visit "},
				{Type: "link", Text: "https://example.com", Data: map[string]interface{}{
					"href": "https://example.com",
					"preview": map[string]interface{}{
						"url":         "https://proxy.nuts.cash/?url=https://example.com",
						"title":       "Link Preview",
						"description": "Link preview not implemented",
					},
				}},
				{Type: "text", Text: " for more"},
			},
		},
		{
			name:    "Mixed content",
			content: "Hello #world!\nCheck out https://example.com and ```const x = 5;```\nHere's an image: https://example.com/cat.jpg",
			expected: []ContentBlock{
				{Type: "text", Text: "Hello "},
				{Type: "hashtag", Text: "#world", Data: map[string]interface{}{"tag": "world"}},
				{Type: "text", Text: "!\nCheck out "},
				{Type: "link", Text: "https://example.com", Data: map[string]interface{}{
					"href": "https://example.com",
					"preview": map[string]interface{}{
						"url":         "https://proxy.nuts.cash/?url=https://example.com",
						"title":       "Link Preview",
						"description": "Link preview not implemented",
					},
				}},
				{Type: "text", Text: " and "},
				{Type: "code", Text: "```const x = 5;```", Data: map[string]interface{}{"code": "const x = 5;"}},
				{Type: "text", Text: "\nHere's an image: "},
				{Type: "image", Text: "https://example.com/cat.jpg", Data: map[string]interface{}{"src": "https://example.com/cat.jpg"}},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ParseContent(tt.content)
			if err != nil {
				t.Fatalf("Failed to parse content: %v", err)
			}

			// For debugging - print expected and actual JSON
			expectedJSON, _ := json.MarshalIndent(tt.expected, "", "  ")
			resultJSON, _ := json.MarshalIndent(result, "", "  ")

			if !reflect.DeepEqual(result, tt.expected) {
				t.Errorf("ParseContent() mismatch\nExpected: %s\nActual: %s", expectedJSON, resultJSON)

				// More detailed comparison to pinpoint differences
				if len(result) != len(tt.expected) {
					t.Errorf("Block count mismatch. Got %d blocks, expected %d", len(result), len(tt.expected))
				} else {
					for i := range result {
						if !reflect.DeepEqual(result[i], tt.expected[i]) {
							t.Errorf("Block %d mismatch:\nExpected: %+v\nActual: %+v", i, tt.expected[i], result[i])
						}
					}
				}
			}
		})
	}
}

func TestOverlappingPatterns(t *testing.T) {
	// Test for correctly handling overlapping patterns
	content := "Check this link with image: https://example.com/image.jpg"

	result, err := ParseContent(content)
	if err != nil {
		t.Fatalf("Failed to parse content: %v", err)
	}

	// Should recognize this as an image, not a generic link
	found := false
	for _, block := range result {
		if block.Type == "image" && block.Text == "https://example.com/image.jpg" {
			found = true
			break
		}
	}

	if !found {
		resultJSON, _ := json.MarshalIndent(result, "", "  ")
		t.Errorf("Failed to correctly prioritize image over link: %s", resultJSON)
	}
}

func TestMediaGridGrouping(t *testing.T) {
	// Test for correctly grouping media items
	content := "Look at these images:\nhttps://example.com/image1.jpg\nhttps://example.com/image2.jpg\nhttps://example.com/image3.jpg\nAren't they nice?"

	result, err := ParseContent(content)
	if err != nil {
		t.Fatalf("Failed to parse content: %v", err)
	}

	// Find the mediaGrid block
	var mediaGridFound bool
	var itemCount int

	for _, block := range result {
		if block.Type == "mediaGrid" {
			mediaGridFound = true
			if items, ok := block.Data["items"].([]map[string]interface{}); ok {
				itemCount = len(items)
			}
			break
		}
	}

	if !mediaGridFound {
		resultJSON, _ := json.MarshalIndent(result, "", "  ")
		t.Errorf("Expected mediaGrid block not found: %s", resultJSON)
	}

	if itemCount != 3 {
		t.Errorf("Expected 3 items in mediaGrid, got %d", itemCount)
	}
}

func TestNostrEntities(t *testing.T) {
	// This test will fail since nip19.Decode will fail on these fake entities
	// But it shows how you would test it with valid entities
	content := "Check this nostr:npub1abcdefg profile"

	result, err := ParseContent(content)
	if err != nil {
		t.Fatalf("Failed to parse content: %v", err)
	}

	// Should fall back to text since decode will fail
	for _, block := range result {
		if block.Type != "text" {
			t.Errorf("Expected invalid nostr entity to be treated as text, got %s", block.Type)
		}
	}
}

// TestEdgeCases tests various edge cases
func TestEdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected int // just check number of blocks for simplicity
	}{
		{
			name:     "Empty content",
			content:  "",
			expected: 0, // Should have one empty text block
		},
		{
			name:     "Only whitespace",
			content:  "   \n\t   ",
			expected: 1,
		},
		{
			name:     "Incomplete code block",
			content:  "This is ```incomplete",
			expected: 1, // Should be treated as plain text
		},
		{
			name:     "Multiple consecutive hashtags",
			content:  "#one #two #three",
			expected: 5, // 3 hashtags with text in between
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ParseContent(tt.content)
			if err != nil {
				t.Fatalf("Failed to parse content: %v", err)
			}

			if len(result) != tt.expected {
				resultJSON, _ := json.MarshalIndent(result, "", "  ")
				t.Errorf("Expected %d blocks, got %d: %s", tt.expected, len(result), resultJSON)
			}
		})
	}
}
