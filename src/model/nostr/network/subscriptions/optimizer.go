//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/candypoets/nutscash/nostr/config"
	"github.com/candypoets/nutscash/nostr/relays"
	"github.com/candypoets/nutscash/nostr/types"
)

// subscriptionOptimizer implements the SubscriptionOptimizer interface
type subscriptionOptimizer struct {
	parser EventParser
}

// NewSubscriptionOptimizer creates a new instance of subscriptionOptimizer
func NewSubscriptionOptimizer(parser EventParser) SubscriptionOptimizer {
	return &subscriptionOptimizer{
		parser: parser,
	}
}

// findNIP65Relays attempts to find relays for authors using NIP-65
func (so *subscriptionOptimizer) findNIP65Relays(request types.Request) []string {
	// if the request has just one author, try to find the 10002 event locally
	if len(request.Authors) <= 50 && so.parser != nil {
		relays := []string{}
		for _, author := range request.Authors {
			if len(request.Kinds) > 0 {
				// Note: This assumes the parser has a GetRelays method
				// If not available, we'll fall back to default relays
				relays = append(relays, so.parser.GetRelays(request.Kinds[0], author, true)...)
			}
		}

		// Deduplicate relays
		dedupRelays := make(map[string]bool)
		for _, relay := range relays {
			dedupRelays[relay] = true
		}

		uniqueRelays := []string{}
		for relay := range dedupRelays {
			uniqueRelays = append(uniqueRelays, relay)
		}

		if len(uniqueRelays) > 0 {
			return uniqueRelays
		}
	}
	return []string{}
}

// OptimizeSubscriptions optimizes a list of requests by merging compatible filters and relay sets
func (so *subscriptionOptimizer) OptimizeSubscriptions(requests []types.Request) []types.Request {
	if len(requests) == 0 {
		return []types.Request{}
	}

	var optimizedRequests []types.Request
	var optimizableRequests []types.Request

	// make sure each request has at least one relay, if not apply default relay
	for i := range requests {
		// strip out any relays that are localhost or local IP addresses
		if requests[i].Relays != nil {
			cleanRelays := relays.CleanRelays(requests[i].Relays)
			requests[i].Relays = cleanRelays
		}
		if requests[i].Relays == nil || len(requests[i].Relays) == 0 {
			nip65s := so.findNIP65Relays(requests[i])
			if len(nip65s) > 0 {
				requests[i].Relays = nip65s
			} else {
				requests[i].Relays = config.DefaultRelays
			}
		}

		// Create individual requests for NoOptimize requests
		if requests[i].NoOptimize || requests[i].CloseOnEOSE {
			optimizedRequests = append(optimizedRequests, requests[i])
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
	filterToRequest := make(map[string]types.Request)

	// First collect all unique filters and their relays
	for relayKeyStr, requests := range relaySetToRequests {
		var relays []string
		_ = json.Unmarshal([]byte(relayKeyStr), &relays)

		for _, request := range requests {
			// Create a copy of the request without relays for comparison
			requestCopy := request
			requestCopy.Relays = nil

			// Convert request to string for map key
			requestJSON, _ := json.Marshal(requestCopy)
			requestKey := string(requestJSON)

			if _, exists := filterToRelays[requestKey]; !exists {
				filterToRelays[requestKey] = []string{}
				filterToRequest[requestKey] = requestCopy
			}

			// Add these relays to this filter's relay list
			for _, relay := range relays {
				// Check if relay already exists in the list
				exists := false
				for _, r := range filterToRelays[requestKey] {
					if r == relay {
						exists = true
						break
					}
				}
				if !exists {
					filterToRelays[requestKey] = append(filterToRelays[requestKey], relay)
				}
			}
		}
	}

	// Step 3: Group filters by their relay sets again and merge compatible requests
	finalRelaySetToRequests := make(map[string][]types.Request)

	for requestKey, relays := range filterToRelays {
		request := filterToRequest[requestKey]
		request.Relays = relays

		// Sort relays for consistent keys
		sort.Strings(relays)
		relayKey, _ := json.Marshal(relays)
		relayKeyStr := string(relayKey)

		finalRelaySetToRequests[relayKeyStr] = append(finalRelaySetToRequests[relayKeyStr], request)
	}

	// Step 4: For each relay set, merge compatible requests
	for relayKeyStr, requestsGroup := range finalRelaySetToRequests {
		var relays []string
		_ = json.Unmarshal([]byte(relayKeyStr), &relays)

		mergedRequests := so.mergeRequests(requestsGroup)
		for i := range mergedRequests {
			mergedRequests[i].Relays = relays
		}

		optimizedRequests = append(optimizedRequests, mergedRequests...)
	}

	return optimizedRequests
}

// mergeRequests merges requests that can be combined
func (so *subscriptionOptimizer) mergeRequests(requests []types.Request) []types.Request {
	if len(requests) <= 1 {
		return requests
	}

	// Group requests by their structure (non-mergeable fields + which tags they have)
	requestGroups := make(map[string][]types.Request)

	for _, request := range requests {
		structureObj := make(map[string]interface{})
		var tagFields []string

		// Copy non-mergeable fields
		if request.Since != nil {
			structureObj["since"] = *request.Since
		}
		if request.Until != nil {
			structureObj["until"] = *request.Until
		}
		if request.Limit != 0 {
			structureObj["limit"] = request.Limit
		}
		if request.Search != "" {
			structureObj["search"] = request.Search
		}

		// For tag fields, just note which ones are present
		if request.Tags != nil {
			for key := range request.Tags {
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

		requestGroups[structureKey] = append(requestGroups[structureKey], request)
	}

	// Merge each group of requests
	var result []types.Request

	for _, requestsGroup := range requestGroups {
		mergedRequest := types.Request{}
		firstRequest := requestsGroup[0]

		// Copy non-mergeable fields from the first request
		if firstRequest.Since != nil {
			since := *firstRequest.Since
			mergedRequest.Since = &since
		}
		if firstRequest.Until != nil {
			until := *firstRequest.Until
			mergedRequest.Until = &until
		}
		if firstRequest.Limit != 0 {
			mergedRequest.Limit = firstRequest.Limit
		}
		if firstRequest.Search != "" {
			mergedRequest.Search = firstRequest.Search
		}
		// Copy other non-mergeable fields
		mergedRequest.NoOptimize = firstRequest.NoOptimize
		// mergedRequest.CloseOnEose = firstRequest.CloseOnEose

		// Start collecting merged values for each field
		idsSet := make(map[string]bool)
		authorsSet := make(map[string]bool)
		kindsSet := make(map[int]bool)
		tagsSet := make(map[string]map[string]bool)

		// Merge the mergeable fields
		for _, request := range requestsGroup {
			// Merge IDs
			if request.IDs != nil {
				for _, id := range request.IDs {
					idsSet[id] = true
				}
			}

			// Merge Authors
			if request.Authors != nil {
				for _, author := range request.Authors {
					authorsSet[author] = true
				}
			}

			// Merge Kinds
			if request.Kinds != nil {
				for _, kind := range request.Kinds {
					kindsSet[kind] = true
				}
			}

			// Merge tag filters
			if request.Tags != nil {
				for key, values := range request.Tags {
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
			mergedRequest.IDs = make([]string, 0, len(idsSet))
			for id := range idsSet {
				mergedRequest.IDs = append(mergedRequest.IDs, id)
			}
		}

		if len(authorsSet) > 0 {
			mergedRequest.Authors = make([]string, 0, len(authorsSet))
			for author := range authorsSet {
				mergedRequest.Authors = append(mergedRequest.Authors, author)
			}
		}

		if len(kindsSet) > 0 {
			mergedRequest.Kinds = make([]int, 0, len(kindsSet))
			for kind := range kindsSet {
				mergedRequest.Kinds = append(mergedRequest.Kinds, kind)
			}
		}

		if len(tagsSet) > 0 {
			mergedRequest.Tags = make(map[string][]string)
			for key, valuesSet := range tagsSet {
				mergedRequest.Tags[key] = make([]string, 0, len(valuesSet))
				for value := range valuesSet {
					mergedRequest.Tags[key] = append(mergedRequest.Tags[key], value)
				}
			}
		}

		result = append(result, mergedRequest)
	}

	return result
}
