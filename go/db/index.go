//go:build js && wasm
// +build js,wasm

package db

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"syscall/js"

	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

// NostrEvent represents a Nostr event
type NostrEvent struct {
	ID        string          `json:"id"`
	PubKey    string          `json:"pubkey"`
	CreatedAt nostr.Timestamp `json:"created_at"`
	Kind      int             `json:"kind"`
	Tags      nostr.Tags      `json:"tags"`
	Content   string          `json:"content"`
	Sig       string          `json:"sig"`
}

// ProcessedNostrEvent extends NostrEvent with extracted tags for easier filtering
type ProcessedNostrEvent struct {
	NostrEvent
	ETags    []string         `json:"e_tags"`
	ATags    []string         `json:"a_tags"`
	PTags    []string         `json:"p_tags"`
	DTags    []string         `json:"d_tags"`
	Parsed   any              `json:"parsed,omitempty"`
	Requests *[]types.Request `json:"requests,omitempty"`
}

func (pe *ProcessedNostrEvent) ToParseEvent() types.ParsedEvent {
	return types.ParsedEvent{
		Event: nostr.Event{
			ID:        pe.ID,
			PubKey:    pe.PubKey,
			CreatedAt: pe.CreatedAt,
			Kind:      pe.Kind,
			Tags:      pe.Tags,
			Content:   pe.Content,
			Sig:       pe.Sig,
		},
		Parsed:   pe.Parsed,
		Requests: pe.Requests,
		// Note: ProcessedNostrEvent doesn't have Relays field
		// so we're initializing it as an empty slice or nil
		Relays: nil,
	}
}

// FromParseEvent converts a types.ParsedEvent to a ProcessedNostrEvent
func FromParseEvent(event types.ParsedEvent) ProcessedNostrEvent {
	// Extract tags by type
	eTags := []string{}
	pTags := []string{}
	aTags := []string{}
	dTags := []string{}

	for _, tag := range event.Tags {
		if len(tag) > 1 {
			switch tag[0] {
			case "e":
				eTags = append(eTags, tag[1])
			case "p":
				pTags = append(pTags, tag[1])
			case "a":
				aTags = append(aTags, tag[1])
			case "d":
				dTags = append(dTags, tag[1])
			}
		}
	}

	return ProcessedNostrEvent{
		NostrEvent: NostrEvent{
			ID:        event.ID,
			PubKey:    event.PubKey,
			CreatedAt: event.CreatedAt,
			Kind:      event.Kind,
			Tags:      event.Tags,
			Content:   event.Content,
			Sig:       event.Sig,
		},
		ETags:    eTags,
		PTags:    pTags,
		ATags:    aTags,
		DTags:    dTags,
		Parsed:   event.Parsed,
		Requests: event.Requests,
	}
}

// NostrDB is the in-memory database for Nostr events
type NostrDB struct {
	sync.RWMutex
	// Primary storage
	eventsById map[string]ProcessedNostrEvent

	// Additional indexes for faster querying
	eventsByKind   map[int]map[string]bool    // kind -> set of event IDs
	eventsByPubkey map[string]map[string]bool // pubkey -> set of event IDs
	eventsByETag   map[string]map[string]bool // e_tag -> set of event IDs
	eventsByPTag   map[string]map[string]bool // p_tag -> set of event IDs
	eventsByATag   map[string]map[string]bool // a_tag -> set of event IDs
	eventsByDTag   map[string]map[string]bool // d_tag -> set of event IDs

	// Special index for profiles (kind 0 events)
	profilesByPubkey map[string]ProcessedNostrEvent

	isInitialized bool
}

// Global instance of the database
var DB *NostrDB

// IsInitialized returns whether the database has been initialized
func (db *NostrDB) IsInitialized() bool {
	db.RLock()
	defer db.RUnlock()
	return db.isInitialized
}

// InitNostrDB creates and returns a new NostrDB instance
func InitNostrDB() *NostrDB {
	if DB != nil {
		return DB
	}

	DB = &NostrDB{
		eventsById:       make(map[string]ProcessedNostrEvent),
		eventsByKind:     make(map[int]map[string]bool),
		eventsByPubkey:   make(map[string]map[string]bool),
		eventsByETag:     make(map[string]map[string]bool),
		eventsByPTag:     make(map[string]map[string]bool),
		eventsByATag:     make(map[string]map[string]bool),
		eventsByDTag:     make(map[string]map[string]bool),
		profilesByPubkey: make(map[string]ProcessedNostrEvent),
		isInitialized:    false,
	}

	// err := DB.LoadFromPersistentStorage("nostr-local-relay")
	// if err != nil {
	// 	fmt.Printf("Error loading from persistent storage: %v\n", err)
	// }

	return DB
}

// addEventToIndex adds an event ID to the specified index
func addEventToIndex(index map[string]map[string]bool, key string, eventID string) {
	if _, exists := index[key]; !exists {
		index[key] = make(map[string]bool)
	}
	index[key][eventID] = true
}

// addEventToKindIndex adds an event ID to the kind index
func addEventToKindIndex(index map[int]map[string]bool, kind int, eventID string) {
	if _, exists := index[kind]; !exists {
		index[kind] = make(map[string]bool)
	}
	index[kind][eventID] = true
}

// indexEvent adds an event to all the indexes
func (db *NostrDB) indexEvent(event ProcessedNostrEvent) {
	eventID := event.ID
	// Add to primary storage
	db.eventsById[eventID] = event
	// Index by kind
	addEventToKindIndex(db.eventsByKind, event.Kind, eventID)

	// Index by pubkey
	addEventToIndex(db.eventsByPubkey, event.PubKey, eventID)

	// Index by e_tags
	for _, tag := range event.ETags {
		addEventToIndex(db.eventsByETag, tag, eventID)
	}

	// Index by p_tags
	for _, tag := range event.PTags {
		addEventToIndex(db.eventsByPTag, tag, eventID)
	}

	// Index by a_tags
	for _, tag := range event.ATags {
		addEventToIndex(db.eventsByATag, tag, eventID)
	}

	// Index by d_tags
	for _, tag := range event.DTags {
		addEventToIndex(db.eventsByDTag, tag, eventID)
	}

	// Special handling for profiles (kind 0)
	if event.Kind == 0 {
		db.profilesByPubkey[event.PubKey] = event
	}
}

func (db *NostrDB) SaveEventsToPersistentStorage(events []types.ParsedEvent) error {
	if len(events) == 0 {
		return nil // Nothing to save
	}

	fmt.Printf("Saving %d events to IndexedDB\n", len(events))

	// Create channels for completion and errors
	doneCh := make(chan bool)
	errCh := make(chan error)

	// Process events before sending to JS
	processedEvents := make([]ProcessedNostrEvent, len(events))
	for i, event := range events {
		processedEvents[i] = FromParseEvent(event)
	}

	// Convert to JSON for passing to JavaScript
	eventsJSON, err := json.Marshal(processedEvents)
	if err != nil {
		return fmt.Errorf("failed to marshal events: %w", err)
	}

	// Using syscall/js for WASM interop
	go func() {
		// Get JS global object
		global := js.Global()

		// Create a JS array from the JSON
		eventsArray := global.Get("JSON").Call("parse", string(eventsJSON))

		// Create a JavaScript function to save the events
		saveEventsFn := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			// Return a new Promise
			return global.Get("Promise").New(js.FuncOf(func(this js.Value, promiseArgs []js.Value) interface{} {
				resolve := promiseArgs[0]
				reject := promiseArgs[1]

				// Open the IndexedDB database
				openDBPromise := global.Get("openDB").Invoke("nostr-local-relay", 1)

				// Handle database opening error
				openDBPromise.Call("catch", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
					err := args[0]
					reject.Invoke(err)
					return nil
				}))

				// Handle successful database opening
				openDBPromise.Call("then", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
					db := args[0]

					// Open a transaction and get the events store
					tx := db.Call("transaction", js.ValueOf([]interface{}{"events"}), js.ValueOf("readwrite"))
					store := tx.Call("objectStore", js.ValueOf("events"))

					// Create an array to hold all promises
					promisesArray := global.Get("Array").New(eventsArray.Length())

					// Create a promise for each put operation
					for i := 0; i < eventsArray.Length(); i++ {
						event := eventsArray.Index(i)
						putPromise := store.Call("put", event)
						promisesArray.SetIndex(i, putPromise)
					}

					// Use Promise.all to wait for all promises to complete
					global.Get("Promise").Call("all", promisesArray).Call("then",
						js.FuncOf(func(this js.Value, args []js.Value) interface{} {
							// All operations succeeded
							resolve.Invoke("Success")
							return nil
						})).Call("catch",
						js.FuncOf(func(this js.Value, args []js.Value) interface{} {
							// At least one operation failed
							reject.Invoke(args[0])
							return nil
						}))

					return nil
				}))

				return nil
			}))
		})
		defer saveEventsFn.Release()

		// Call the function and handle the result
		saveEventsFn.Invoke().Call("then",
			js.FuncOf(func(this js.Value, args []js.Value) interface{} {
				doneCh <- true
				return nil
			})).Call("catch",
			js.FuncOf(func(this js.Value, args []js.Value) interface{} {
				err := args[0]
				errCh <- fmt.Errorf("failed to save events: %s", err.Get("message").String())
				return nil
			}))
	}()

	// Wait for completion or error
	select {
	case <-doneCh:
		fmt.Printf("Successfully saved %d events to IndexedDB\n", len(events))
		return nil
	case err := <-errCh:
		fmt.Printf("Error saving %d events to IndexedDB: %s\n", len(events), err)
		return err
	}
}

// LoadFromPersistentStorage loads pre-processed events from IndexedDB to the in-memory database
func (db *NostrDB) LoadFromPersistentStorage(source string) error {
	db.Lock()
	defer db.Unlock()

	// Clear existing indexes before loading
	db.eventsById = make(map[string]ProcessedNostrEvent)
	db.eventsByKind = make(map[int]map[string]bool)
	db.eventsByPubkey = make(map[string]map[string]bool)
	db.eventsByETag = make(map[string]map[string]bool)
	db.eventsByPTag = make(map[string]map[string]bool)
	db.eventsByATag = make(map[string]map[string]bool)
	db.eventsByDTag = make(map[string]map[string]bool)
	db.profilesByPubkey = make(map[string]ProcessedNostrEvent)

	fmt.Println("Loading events from IndexedDB:", source)

	// Create a channel to receive events and a channel for completion
	eventsCh := make(chan ProcessedNostrEvent)
	doneCh := make(chan bool)
	errCh := make(chan error)

	// Using syscall/js for WASM interop
	// This code runs in a separate goroutine to allow async JS operations
	go func() {
		// Get JS global object
		global := js.Global()

		// Open the IndexedDB database
		openDBPromise := global.Get("openDB").Invoke("nostr-local-relay", 1)

		// Handle database opening error
		openDBPromise.Call("catch", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			err := args[0]
			errCh <- fmt.Errorf("failed to open IndexedDB: %s", err.Get("message").String())
			return nil
		}))

		// Handle successful database opening
		openDBPromise.Call("then", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			db := args[0]

			// Open a transaction and get the events store
			tx := db.Call("transaction", js.ValueOf([]interface{}{"events"}), js.ValueOf("readonly"))
			store := tx.Call("objectStore", js.ValueOf("events"))

			// Get all events
			getAllPromise := store.Call("getAll")

			// Handle get all error
			getAllPromise.Call("catch", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
				err := args[0]
				errCh <- fmt.Errorf("failed to get events: %s", err.Get("message").String())
				return nil
			}))

			// Handle successful retrieval of all events
			getAllPromise.Call("then", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
				eventsArray := args[0]
				length := eventsArray.Length()

				// If no events, signal completion
				if length == 0 {
					doneCh <- true
					return nil
				}

				// Process each event
				for i := 0; i < length; i++ {
					jsEvent := eventsArray.Index(i)

					// Convert JS object to JSON string
					jsonStr := js.Global().Get("JSON").Call("stringify", jsEvent).String()
					var event ProcessedNostrEvent
					if err := json.Unmarshal([]byte(jsonStr), &event); err != nil {
						// Handle error
						println("Error unmarshaling event:", err)
						continue
					}

					// Send the event to the main goroutine
					eventsCh <- event
				}

				// Signal completion
				doneCh <- true
				return nil
			}))

			return nil
		}))

	}()

	// Process events as they come in
	eventCount := 0
	profileCount := 0

	// Wait for events or completion
	for {
		select {
		case event := <-eventsCh:
			eventCount++

			db.indexEvent(event)

			// Special handling for profiles (kind 0)
			if event.Kind == 0 {
				db.profilesByPubkey[event.PubKey] = event
				profileCount++
			}

		case <-doneCh:
			// All events processed
			db.isInitialized = true
			fmt.Printf("In-memory database initialized with %d events and %d profiles\n",
				eventCount, profileCount)
			return nil

		case err := <-errCh:
			// Error occurred
			return err
		}
	}
}

// AddEvent adds a single event to the database
func (db *NostrDB) AddEvent(event types.ParsedEvent) error {
	if event.ID == "" {
		return errors.New("event ID cannot be empty")
	}

	processedEvent := FromParseEvent(event)

	db.Lock()
	defer db.Unlock()

	// Update all indexes
	db.indexEvent(processedEvent)

	return nil
}

// AddEvents adds multiple events to the database in one operation
func (db *NostrDB) AddEvents(events []types.ParsedEvent) ([]string, error) {
	if len(events) == 0 {
		return nil, nil
	}

	processedEventIDs := make([]string, 0, len(events))

	db.Lock()
	defer db.Unlock()

	for _, event := range events {
		if event.ID == "" {
			continue
		}

		processedEvent := FromParseEvent(event)

		processedEventIDs = append(processedEventIDs, processedEvent.ID)

		// Update all indexes
		db.indexEvent(processedEvent)
	}

	return processedEventIDs, nil
}

// getIDsFromMap extracts keys from a map where values are true
func getIDsFromMap(m map[string]bool) []string {
	result := make([]string, 0, len(m))
	for id := range m {
		result = append(result, id)
	}
	return result
}

// intersectMaps returns a new map containing keys that exist in both maps
func intersectMaps(a, b map[string]bool) map[string]bool {
	if len(a) == 0 || len(b) == 0 {
		return make(map[string]bool)
	}

	// Use the smaller map for iteration to optimize
	if len(a) > len(b) {
		a, b = b, a
	}

	result := make(map[string]bool)
	for key := range a {
		if b[key] {
			result[key] = true
		}
	}

	return result
}

// QueryEvents retrieves events that match the given filter
func (db *NostrDB) QueryEvents(filter nostr.Filter, limit ...int) ([]types.ParsedEvent, error) {
	db.RLock()
	defer db.RUnlock()

	// Candidate set of matching event IDs
	var candidateIDs map[string]bool
	isFirstFilter := true

	// Start with indexed fields for better performance

	// 1. Filter by IDs (direct lookup - most efficient)
	if len(filter.IDs) > 0 {
		currentMatches := make(map[string]bool)
		for _, id := range filter.IDs {
			if _, exists := db.eventsById[id]; exists {
				currentMatches[id] = true
			}
		}

		if isFirstFilter {
			candidateIDs = currentMatches
			isFirstFilter = false
		} else {
			candidateIDs = intersectMaps(candidateIDs, currentMatches)
		}

		if len(candidateIDs) == 0 {
			return []types.ParsedEvent{}, nil
		}
	}

	// 2. Filter by kinds (indexed lookup)
	if len(filter.Kinds) > 0 {
		currentMatches := make(map[string]bool)
		for _, kind := range filter.Kinds {
			if kindIndex, exists := db.eventsByKind[kind]; exists {
				for id := range kindIndex {
					currentMatches[id] = true
				}
			}
		}

		if isFirstFilter {
			candidateIDs = currentMatches
			isFirstFilter = false
		} else {
			candidateIDs = intersectMaps(candidateIDs, currentMatches)
		}

		if len(candidateIDs) == 0 {
			return []types.ParsedEvent{}, nil
		}
	}

	// 3. Filter by authors (indexed lookup)
	if len(filter.Authors) > 0 {
		currentMatches := make(map[string]bool)
		for _, author := range filter.Authors {
			if pubkeyIndex, exists := db.eventsByPubkey[author]; exists {
				for id := range pubkeyIndex {
					currentMatches[id] = true
				}
			}
		}

		if isFirstFilter {
			candidateIDs = currentMatches
			isFirstFilter = false
		} else {
			candidateIDs = intersectMaps(candidateIDs, currentMatches)
		}

		if len(candidateIDs) == 0 {
			return []types.ParsedEvent{}, nil
		}
	}

	// 4. Filter by e tags (indexed lookup)
	if eTags, ok := filter.Tags["#e"]; ok && len(eTags) > 0 {
		currentMatches := make(map[string]bool)
		for _, tag := range eTags {
			if eTagIndex, exists := db.eventsByETag[tag]; exists {
				for id := range eTagIndex {
					currentMatches[id] = true
				}
			}
		}

		if isFirstFilter {
			candidateIDs = currentMatches
			isFirstFilter = false
		} else {
			candidateIDs = intersectMaps(candidateIDs, currentMatches)
		}

		if len(candidateIDs) == 0 {
			return []types.ParsedEvent{}, nil
		}
	}

	// 5. Filter by p tags (indexed lookup)
	if pTags, ok := filter.Tags["#p"]; ok && len(pTags) > 0 {
		currentMatches := make(map[string]bool)
		for _, tag := range pTags {
			if pTagIndex, exists := db.eventsByPTag[tag]; exists {
				for id := range pTagIndex {
					currentMatches[id] = true
				}
			}
		}

		if isFirstFilter {
			candidateIDs = currentMatches
			isFirstFilter = false
		} else {
			candidateIDs = intersectMaps(candidateIDs, currentMatches)
		}

		if len(candidateIDs) == 0 {
			return []types.ParsedEvent{}, nil
		}
	}

	// 6. Filter by a tags (indexed lookup)
	if aTags, ok := filter.Tags["#a"]; ok && len(aTags) > 0 {
		currentMatches := make(map[string]bool)
		for _, tag := range aTags {
			if aTagIndex, exists := db.eventsByATag[tag]; exists {
				for id := range aTagIndex {
					currentMatches[id] = true
				}
			}
		}

		if isFirstFilter {
			candidateIDs = currentMatches
			isFirstFilter = false
		} else {
			candidateIDs = intersectMaps(candidateIDs, currentMatches)
		}

		if len(candidateIDs) == 0 {
			return []types.ParsedEvent{}, nil
		}
	}

	// 7. Filter by d tags (indexed lookup)
	if dTags, ok := filter.Tags["#d"]; ok && len(dTags) > 0 {
		currentMatches := make(map[string]bool)
		for _, tag := range dTags {
			if dTagIndex, exists := db.eventsByDTag[tag]; exists {
				for id := range dTagIndex {
					currentMatches[id] = true
				}
			}
		}

		if isFirstFilter {
			candidateIDs = currentMatches
			isFirstFilter = false
		} else {
			candidateIDs = intersectMaps(candidateIDs, currentMatches)
		}

		if len(candidateIDs) == 0 {
			return []types.ParsedEvent{}, nil
		}
	}

	// If no filters were applied, use all events
	if isFirstFilter {
		// Return all events up to the limit
		result := make([]types.ParsedEvent, 0, len(db.eventsById))
		for _, event := range db.eventsById {
			result = append(result, event.ToParseEvent())
			if len(limit) > 0 && len(result) >= limit[0] {
				break
			}
		}
		return result, nil
	}

	// Convert candidate IDs to a slice for easier handling
	eventIDs := getIDsFromMap(candidateIDs)

	// Apply limit if specified
	if len(limit) > 0 && len(eventIDs) > limit[0] {
		eventIDs = eventIDs[:limit[0]]
	}

	// Collect the matching events
	result := make([]types.ParsedEvent, 0, len(eventIDs))
	for _, id := range eventIDs {
		if event, exists := db.eventsById[id]; exists {
			result = append(result, event.ToParseEvent())
		}
	}

	return result, nil
}

// GetEvent retrieves a single event by ID
func (db *NostrDB) GetEvent(id string) (types.ParsedEvent, bool) {
	db.RLock()
	defer db.RUnlock()

	event, exists := db.eventsById[id]
	return event.ToParseEvent(), exists
}

// HasEvent checks if an event with the given ID exists
func (db *NostrDB) HasEvent(id string) bool {
	db.RLock()
	defer db.RUnlock()

	_, exists := db.eventsById[id]
	return exists
}

// GetProfile retrieves a profile for a given pubkey
func (db *NostrDB) GetProfile(pubkey string) (types.ParsedEvent, bool) {
	db.RLock()
	defer db.RUnlock()

	// Direct lookup from profiles index
	profile, exists := db.profilesByPubkey[pubkey]
	return profile.ToParseEvent(), exists
}
