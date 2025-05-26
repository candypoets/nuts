package relays

import (
	"reflect"
	"testing"
)

func TestCleanRelays(t *testing.T) {
	tests := []struct {
		name     string
		input    []string
		expected []string
	}{
		{
			name:     "Empty input",
			input:    []string{},
			expected: []string{},
		},
		{
			name:     "Empty string in array",
			input:    []string{"wss://relay.example.com", "", "wss://another.relay.com"},
			expected: []string{"wss://relay.example.com", "wss://another.relay.com"},
		},
		{
			name: "Media file URLs",
			input: []string{
				"wss://relay.example.com/image.png",
				"wss://relay.example.com/video.mp4/",
				"wss://valid.relay.com",
				"wss://i.nostr.build/5JIRtxJpaHXrYvzK.jpg",
				"wss://relay.example.com/audio.wav",
				"wss://media1.tenor.com/m/A90xKAZllcgAAAAC/hot-hotdogs.gif",
			},
			expected: []string{"wss://valid.relay.com"},
		},
		{
			name: "Local network addresses",
			input: []string{
				"wss://localhost",
				"wss://127.0.0.1",
				"wss://192.168.1.1",
				"wss://10.0.0.1",
				"wss://172.16.0.1",
				"wss://valid.relay.com",
			},
			expected: []string{"wss://valid.relay.com"},
		},
		{
			name: "Protocol variants",
			input: []string{
				"wss://relay1.com",
				"ws://relay2.com",
				"relay3.com",
			},
			expected: []string{
				"wss://relay1.com",
				"ws://relay2.com",
				"relay3.com",
			},
		},
		{
			name: "Trailing slashes",
			input: []string{
				"wss://relay1.com/",
				"wss://relay2.com///",
				"wss://relay3.com",
			},
			expected: []string{
				"wss://relay1.com/",
				"wss://relay2.com///",
				"wss://relay3.com",
			},
		},
		{
			name: "Mixed valid and invalid",
			input: []string{
				"wss://relay1.com",
				"wss://localhost",
				"wss://relay2.com/image.jpg/",
				"wss://relay3.com",
				"",
				"wss://192.168.1.1",
			},
			expected: []string{
				"wss://relay1.com",
				"wss://relay3.com",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CleanRelays(tt.input)
			if !reflect.DeepEqual(result, tt.expected) {
				t.Errorf("CleanRelays() = %v, want %v", result, tt.expected)
			}
		})
	}
}
