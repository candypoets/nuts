package network

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/candypoets/nutscash/config"
	"github.com/candypoets/nutscash/parser"
	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

type Sub struct {
	Relays  []string
	Filters []nostr.Filter
}

func (sm *SubscriptionManager) findNIP65Relays(request types.Request) []string {
	// if the request has just one author, try to find the 10002 event locally
	if len(request.Authors) < 10 {
		relays := make(map[string]bool)
		for _, author := range request.Authors {
			event, ok := sm.database.QueryEvent(nostr.Filter{Kinds: []int{10002}, Authors: []string{author}})
			if !ok {
				continue
			}

			parsed, err := sm.Parser.Parse(event.Event)

			if err != nil {
				continue
			}

			relayList, ok := parsed.Parsed.(*parser.Kind10002Parsed)
			if !ok {
				continue
			}

			// Only add write relays to our collection
			for _, relay := range *relayList {
				if relay.Write {
					relays[relay.URL] = true
				}
			}
		}

		// Convert the map to a slice of relays
		keys := make([]string, 0, len(relays))
		for relay := range relays {
			keys = append(keys, relay)
		}

		return keys
	}
	return []string{}

}

// OptimizeSubscriptions optimizes a list of requests into subscriptions
func (sm *SubscriptionManager) OptimizeSubscriptions(requests []types.Request) []Sub {
	if len(requests) == 0 {
		return []Sub{}
	}

	var subscriptions []Sub
	var optimizableRequests []types.Request

	// make sure each request has at least one relay, if not apply default relay
	for i := range requests {
		// strip out any relays that are localhost or local IP addresses
		if requests[i].Relays != nil {
			cleanRelays := filterLocalRelays(requests[i])
			requests[i].Relays = cleanRelays
		}
		if requests[i].Relays == nil || len(requests[i].Relays) == 0 {
			nip65s := sm.findNIP65Relays(requests[i])
			if len(nip65s) > 0 {
				requests[i].Relays = nip65s
			} else {
				requests[i].Relays = config.DefaultRelays
			}
		}

		// Create individual subscriptions for NoOptimize requests
		if requests[i].NoOptimize {
			// Convert the request to a subscription directly
			filter := requests[i].ToFilter()

			subscription := Sub{
				Relays:  requests[i].Relays,
				Filters: []nostr.Filter{filter},
			}
			subscriptions = append(subscriptions, subscription)
		} else {
			// Collect requests that can be optimized
			optimizableRequests = append(optimizableRequests, requests[i])
		}
	}

	// Step 1: Group requests by their relay sets
	relaySetToRequests := make(map[string][]types.Request)

	for _, request := range optimizableRequests {
		if request.Relays == nil || len(request.Relays) == 0 {
			continue // ignore requests without relays
		}

		// Create a sorted copy of relays for consistent keys
		sortedRelays := make([]string, len(request.Relays))
		copy(sortedRelays, request.Relays)
		sort.Strings(sortedRelays)

		relayKey, _ := json.Marshal(sortedRelays)
		relayKeyStr := string(relayKey)

		relaySetToRequests[relayKeyStr] = append(relaySetToRequests[relayKeyStr], request)
	}

	// Step 2: For identical filters with different relay sets, merge the relay sets
	filterToRelays := make(map[string][]string)
	filterToFilter := make(map[string]nostr.Filter)

	// First collect all unique filters and their relays
	for relayKeyStr, requests := range relaySetToRequests {
		var relays []string
		_ = json.Unmarshal([]byte(relayKeyStr), &relays)

		for _, request := range requests {
			// Create a copy of the filter without relays
			filterCopy := nostr.Filter{}

			// Copy all filter fields
			if request.IDs != nil {
				filterCopy.IDs = request.IDs
			}
			if request.Authors != nil {
				filterCopy.Authors = request.Authors
			}
			if request.Kinds != nil {
				filterCopy.Kinds = request.Kinds
			}
			if request.Tags != nil {
				filterCopy.Tags = make(map[string][]string)
				for k, v := range request.Tags {
					filterCopy.Tags[k] = v
				}
			}
			if request.Since != nil {
				since := *request.Since
				filterCopy.Since = &since
			}
			if request.Until != nil {
				until := *request.Until
				filterCopy.Until = &until
			}
			if request.Limit != 0 {
				limit := request.Limit
				filterCopy.Limit = limit
			}
			if request.Search != "" {
				search := request.Search
				filterCopy.Search = search
			}

			// Convert filter to string for map key
			filterJSON, _ := json.Marshal(filterCopy)
			filterKey := string(filterJSON)

			if _, exists := filterToRelays[filterKey]; !exists {
				filterToRelays[filterKey] = []string{}
				filterToFilter[filterKey] = filterCopy
			}

			// Add these relays to this filter's relay list
			for _, relay := range relays {
				// Check if relay already exists in the list
				exists := false
				for _, r := range filterToRelays[filterKey] {
					if r == relay {
						exists = true
						break
					}
				}
				if !exists {
					filterToRelays[filterKey] = append(filterToRelays[filterKey], relay)
				}
			}
		}
	}

	// Step 3: Group filters by their relay sets again
	finalRelaySetToFilters := make(map[string][]nostr.Filter)

	for filterKey, relays := range filterToRelays {
		filter := filterToFilter[filterKey]

		// Sort relays for consistent keys
		sort.Strings(relays)
		relayKey, _ := json.Marshal(relays)
		relayKeyStr := string(relayKey)

		finalRelaySetToFilters[relayKeyStr] = append(finalRelaySetToFilters[relayKeyStr], filter)
	}

	for relayKeyStr, filters := range finalRelaySetToFilters {
		var relays []string
		_ = json.Unmarshal([]byte(relayKeyStr), &relays)

		optimizedFilters := MergeFilters(filters)

		subscription := Sub{
			Relays:  relays,
			Filters: optimizedFilters,
		}
		subscriptions = append(subscriptions, subscription)
	}

	return subscriptions
}

// mergeFilters merges filters that can be combined
func MergeFilters(filters []nostr.Filter) []nostr.Filter {
	// Group filters by their structure (non-mergeable fields + which tags they have)
	filterGroups := make(map[string][]nostr.Filter)

	for _, filter := range filters {
		structureObj := make(map[string]interface{})
		var tagFields []string

		// Copy non-mergeable fields
		if filter.Since != nil {
			structureObj["since"] = *filter.Since
		}
		if filter.Until != nil {
			structureObj["until"] = *filter.Until
		}
		if filter.Limit != 0 {
			structureObj["limit"] = filter.Limit
		}
		if filter.Search != "" {
			structureObj["search"] = filter.Search
		}

		// For tag fields, just note which ones are present
		if filter.Tags != nil {
			for key := range filter.Tags {
				if strings.HasPrefix(key, "#") {
					tagFields = append(tagFields, key)
				}
			}
		}

		// Include which tag fields are present in the structure key
		sort.Strings(tagFields)
		structureObj["tagFields"] = tagFields

		structureJSON, _ := json.Marshal(structureObj)
		structureKey := string(structureJSON)

		filterGroups[structureKey] = append(filterGroups[structureKey], filter)
	}

	// Merge each group of filters
	var result []nostr.Filter

	for _, filtersGroup := range filterGroups {
		mergedFilter := nostr.Filter{}
		firstFilter := filtersGroup[0]

		// Copy non-mergeable fields from the first filter
		if firstFilter.Since != nil {
			since := *firstFilter.Since
			mergedFilter.Since = &since
		}
		if firstFilter.Until != nil {
			until := *firstFilter.Until
			mergedFilter.Until = &until
		}
		if firstFilter.Limit != 0 {
			limit := firstFilter.Limit
			mergedFilter.Limit = limit
		}
		if firstFilter.Search != "" {
			search := firstFilter.Search
			mergedFilter.Search = search
		}

		// Start collecting merged values for each field
		idsSet := make(map[string]bool)
		authorsSet := make(map[string]bool)
		kindsSet := make(map[int]bool)
		tagsSet := make(map[string]map[string]bool)

		// Merge the mergeable fields
		for _, filter := range filtersGroup {
			// Merge IDs
			if filter.IDs != nil {
				for _, id := range filter.IDs {
					idsSet[id] = true
				}
			}

			// Merge Authors
			if filter.Authors != nil {
				for _, author := range filter.Authors {
					authorsSet[author] = true
				}
			}

			// Merge Kinds
			if filter.Kinds != nil {
				for _, kind := range filter.Kinds {
					kindsSet[kind] = true
				}
			}

			// Merge tag filters
			if filter.Tags != nil {
				for key, values := range filter.Tags {
					if strings.HasPrefix(key, "#") {
						if _, exists := tagsSet[key]; !exists {
							tagsSet[key] = make(map[string]bool)
						}
						for _, value := range values {
							tagsSet[key][value] = true
						}
					}
				}
			}
		}

		// Convert sets back to arrays
		if len(idsSet) > 0 {
			mergedFilter.IDs = make([]string, 0, len(idsSet))
			for id := range idsSet {
				mergedFilter.IDs = append(mergedFilter.IDs, id)
			}
		}

		if len(authorsSet) > 0 {
			mergedFilter.Authors = make([]string, 0, len(authorsSet))
			for author := range authorsSet {
				mergedFilter.Authors = append(mergedFilter.Authors, author)
			}
		}

		if len(kindsSet) > 0 {
			mergedFilter.Kinds = make([]int, 0, len(kindsSet))
			for kind := range kindsSet {
				mergedFilter.Kinds = append(mergedFilter.Kinds, kind)
			}
		}

		if len(tagsSet) > 0 {
			mergedFilter.Tags = make(map[string][]string)
			for key, valuesSet := range tagsSet {
				mergedFilter.Tags[key] = make([]string, 0, len(valuesSet))
				for value := range valuesSet {
					mergedFilter.Tags[key] = append(mergedFilter.Tags[key], value)
				}
			}
		}

		result = append(result, mergedFilter)
	}

	return result
}

// filterLocalRelays removes any localhost or local IP addresses from a request's relays
func filterLocalRelays(request types.Request) []string {
	cleanRelays := []string{}
	for _, relay := range request.Relays {
		// Skip empty relays
		if relay == "" {
			continue
		}

		originalRelay := relay
		relay = strings.TrimPrefix(relay, "wss://")
		relay = strings.TrimPrefix(relay, "ws://")

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
