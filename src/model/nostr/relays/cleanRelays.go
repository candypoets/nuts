package relays

import (
	"strings"
)

// CleanRelays processes an array of relay URLs from a request, removing any that are:
// - Empty strings
// - Media file URLs (with extensions like .png, .jpg, etc.)
// - Local network addresses (localhost, 127.0.0.1, private IP ranges)
// It returns an array of cleaned, valid relay URLs.
func CleanRelays(relays []string) []string {
	cleanRelays := []string{}
	for _, relay := range relays {
		// Skip empty relays
		if relay == "" {
			continue
		}

		// Skip if the URL starts with http:// or https://
		if strings.HasPrefix(strings.ToLower(relay), "http://") || strings.HasPrefix(strings.ToLower(relay), "https://") {
			continue
		}

		originalRelay := relay
		relay = strings.TrimPrefix(relay, "wss://")
		relay = strings.TrimPrefix(relay, "ws://")
		relay = strings.TrimRight(relay, "/")

		// Check for media file extensions and other non-relay URLs
		mediaExtensions := []string{".png", ".jpg", ".jpeg", ".gif", ".webp", ".mov", ".mp4", ".avi", ".webm", ".mp3", ".wav", ".ogg"}
		isMediaUrl := false
		for _, ext := range mediaExtensions {
			if strings.HasSuffix(strings.ToLower(relay), ext) {
				isMediaUrl = true
				break
			}
		}

		if isMediaUrl {
			continue
		}

		// Extract hostname part without path, query params, etc.
		relay = strings.Split(relay, "/")[0]
		relay = strings.Split(relay, ":")[0]

		isLocal := false
		if relay == "localhost" || relay == "127.0.0.1" ||
			strings.HasPrefix(relay, "192.168.") ||
			strings.HasPrefix(relay, "10.") ||
			strings.HasPrefix(relay, "172.16.") ||
			strings.HasPrefix(relay, "172.17.") ||
			strings.HasPrefix(relay, "172.18.") ||
			strings.HasPrefix(relay, "172.19.") ||
			strings.HasPrefix(relay, "172.20.") ||
			strings.HasPrefix(relay, "172.21.") ||
			strings.HasPrefix(relay, "172.22.") ||
			strings.HasPrefix(relay, "172.23.") ||
			strings.HasPrefix(relay, "172.24.") ||
			strings.HasPrefix(relay, "172.25.") ||
			strings.HasPrefix(relay, "172.26.") ||
			strings.HasPrefix(relay, "172.27.") ||
			strings.HasPrefix(relay, "172.28.") ||
			strings.HasPrefix(relay, "172.29.") ||
			strings.HasPrefix(relay, "172.30.") ||
			strings.HasPrefix(relay, "172.31.") {
			isLocal = true
		}

		// Only add valid, non-local, non-media relays
		if !isLocal {
			cleanRelays = append(cleanRelays, originalRelay)
		}
	}
	return cleanRelays
}
