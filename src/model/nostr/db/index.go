//go:build js && wasm
// +build js,wasm

package db

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"syscall/js"

	"github.com/candypoets/nutscash/nostr/types"
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

	err := DB.LoadFromPersistentStorage("nostr-local-relay")
	if err != nil {
		fmt.Printf("Error loading from persistent storage: %v\n", err)
	}

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

func openNostrDB(dbName string, version int) js.Value {

	console := js.Global().Get("console") // For logging

	var upgradeCallback js.Func
	upgradeCallback = js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		// Arguments from 'idb' upgrade: db, oldVersion, newVersion, transaction, event
		dbJS := args[0] // This is an IDBPDatabase object from the 'idb' library
		// oldVersionJS := args[1] // The old database version (integer)
		// newVersionJS := args[2] // The new database version (integer)
		transactionJS := args[3] // This is an IDBPTransaction for the upgrade
		// eventJS := args[4]      // The raw IDBVersionChangeEvent (rarely needed with idb)

		console.Call("log", "[Go openNostrDB] 'upgrade' callback invoked by JavaScript openDB. DB:", dbJS)

		var eventStore js.Value // This will be an IDBPObjectStore
		// Check if the 'events' object store already exists using IDBPDatabase.objectStoreNames
		if dbJS.Get("objectStoreNames").Call("contains", "events").Bool() {
			// If it exists, get it via the upgrade transaction
			eventStore = transactionJS.Call("objectStore", "events")
			console.Call("log", "[Go openNostrDB] 'events' object store already exists, obtained via transaction.")
		} else {
			// If it doesn't exist, create it on the IDBPDatabase
			storeOptions := js.ValueOf(map[string]interface{}{
				"keyPath": "id", // Standard IndexedDB options
			})
			eventStore = dbJS.Call("createObjectStore", "events", storeOptions)
			console.Call("log", "[Go openNostrDB] 'events' object store created.")
		}

		// Helper to create an index if it doesn't exist on an IDBPObjectStore
		createIndexIfNotExists := func(store js.Value, indexName, keyPath string, options map[string]interface{}) {
			if store.IsUndefined() || store.IsNull() {
				console.Call("error", "[Go openNostrDB] createIndex: store is invalid for index", indexName)
				return
			}
			// IDBPObjectStore has 'indexNames' (a DOMStringList) and 'createIndex'
			if !store.Get("indexNames").Call("contains", indexName).Bool() {
				jsOptions := js.ValueOf(options)
				store.Call("createIndex", indexName, keyPath, jsOptions)
				console.Call("log", fmt.Sprintf("[Go openNostrDB] Index '%s' on keyPath '%s' created.", indexName, keyPath))
			} else {
				console.Call("log", fmt.Sprintf("[Go openNostrDB] Index '%s' already exists.", indexName))
			}
		}

		// Create all necessary indexes on the eventStore
		createIndexIfNotExists(eventStore, "kind", "kind", map[string]interface{}{"unique": false})
		createIndexIfNotExists(eventStore, "pubkey", "pubkey", map[string]interface{}{"unique": false})
		createIndexIfNotExists(eventStore, "created_at", "created_at", map[string]interface{}{"unique": false})

		tagIndexOptions := map[string]interface{}{"unique": false, "multiEntry": true}
		createIndexIfNotExists(eventStore, "e_tags", "e_tags", tagIndexOptions)
		createIndexIfNotExists(eventStore, "p_tags", "p_tags", tagIndexOptions)
		createIndexIfNotExists(eventStore, "a_tags", "a_tags", tagIndexOptions)
		createIndexIfNotExists(eventStore, "d_tags", "d_tags", tagIndexOptions)

		console.Call("log", "[Go openNostrDB] 'upgrade' callback finished successfully.")
		return nil // Standard for js.FuncOf callbacks not returning a value to JS
	})

	optionsObject := js.ValueOf(map[string]interface{}{
		"upgrade": upgradeCallback,
	})

	request := js.Global().Get("openDB").Invoke(dbName, version, optionsObject)

	return request
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

	// Create channels for communication
	eventsCh := make(chan []ProcessedNostrEvent, 1)
	errCh := make(chan error, 1)

	// Using syscall/js for WASM interop
	go func() {
		// Get JS global object
		global := js.Global()
		console := global.Get("console")

		// Open the database
		openDBPromise := openNostrDB("nostr-local-relay", 1)

		openDBPromise.Call("then", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			db := args[0]
			console.Call("log", "Database object:", db)
			// Open a transaction and get the object store
			tx := db.Call("transaction", js.ValueOf([]interface{}{"events"}), js.ValueOf("readonly"))
			store := tx.Call("objectStore", js.ValueOf("events"))
			console.Call("log", "Store object:", store, store.Call("count"))
			// Get the count first to allocate memory
			store.Call("count").Call("then", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
				count := args[0].Int()
				console.Call("log", "Total events to load:", count)

				// Get all events now that we know the count
				store.Call("getAll").Call("then", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
					events := args[0]
					length := events.Length()

					// Pre-allocate the slice with the right capacity
					allEvents := make([]ProcessedNostrEvent, 0, length)

					// Process events in batches to avoid blocking the JS thread too long
					const batchSize = 1000
					numBatches := (length + batchSize - 1) / batchSize

					for batchNum := 0; batchNum < numBatches; batchNum++ {
						startIdx := batchNum * batchSize
						endIdx := min(startIdx+batchSize, length)

						// Process this batch
						for i := startIdx; i < endIdx; i++ {
							jsEvent := events.Index(i)

							// Convert JS object to JSON string
							jsonStr := global.Get("JSON").Call("stringify", jsEvent).String()
							var event ProcessedNostrEvent
							if err := json.Unmarshal([]byte(jsonStr), &event); err != nil {
								console.Call("error", "Error unmarshaling event:", err.Error())
								continue
							}

							allEvents = append(allEvents, event)
						}

						// Yield to the JavaScript event loop periodically
						if batchNum < numBatches-1 {
							global.Call("setTimeout", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
								return nil
							}), 0)
						}
					}

					// Send all events back
					eventsCh <- allEvents
					return nil
				})).Call("catch", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
					err := args[0]
					errCh <- fmt.Errorf("failed to get events: %s", err.Get("message").String())
					return nil
				}))

				return nil
			})).Call("catch", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
				err := args[0]
				errCh <- fmt.Errorf("failed to count events: %s", err.Get("message").String())
				return nil
			}))

			return nil
		})).Call("catch", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			err := args[0]
			errCh <- fmt.Errorf("failed to open IndexedDB: %s", err.Get("message").String())
			return nil
		}))
	}()

	// Wait for events or error
	select {
	case events := <-eventsCh:
		eventCount := len(events)
		profileCount := 0

		// Pre-allocate commonly used maps
		for kind := 0; kind <= 10; kind++ {
			db.eventsByKind[kind] = make(map[string]bool)
		}

		// First pass: build the main index and collect statistics
		pubkeyFrequency := make(map[string]int)
		kindFrequency := make(map[int]int)
		eTagFrequency := make(map[string]int)
		pTagFrequency := make(map[string]int)

		for _, event := range events {
			// Add to main index
			db.eventsById[event.ID] = event

			// Count frequencies
			pubkeyFrequency[event.PubKey]++
			kindFrequency[event.Kind]++

			// Count tag frequencies
			for _, tag := range event.Tags {
				if len(tag) < 2 {
					continue
				}

				tagType := tag[0]
				tagValue := tag[1]

				switch tagType {
				case "e":
					eTagFrequency[tagValue]++
				case "p":
					pTagFrequency[tagValue]++
				}
			}

			// Track profiles
			if event.Kind == 0 {
				db.profilesByPubkey[event.PubKey] = event
				profileCount++
			}
		}

		// Pre-allocate maps for high-frequency items
		for pubkey, count := range pubkeyFrequency {
			if count > 5 { // Threshold for pre-allocation
				db.eventsByPubkey[pubkey] = make(map[string]bool, count)
			}
		}

		for kind, count := range kindFrequency {
			if db.eventsByKind[kind] == nil {
				db.eventsByKind[kind] = make(map[string]bool, count)
			}
		}

		for etag, count := range eTagFrequency {
			if count > 5 {
				db.eventsByETag[etag] = make(map[string]bool, count)
			}
		}

		for ptag, count := range pTagFrequency {
			if count > 5 {
				db.eventsByPTag[ptag] = make(map[string]bool, count)
			}
		}

		// Second pass: build the indexes with pre-allocated maps
		for _, event := range events {
			// Index by kind
			if _, exists := db.eventsByKind[event.Kind]; !exists {
				db.eventsByKind[event.Kind] = make(map[string]bool)
			}
			db.eventsByKind[event.Kind][event.ID] = true

			// Index by pubkey
			if _, exists := db.eventsByPubkey[event.PubKey]; !exists {
				db.eventsByPubkey[event.PubKey] = make(map[string]bool)
			}
			db.eventsByPubkey[event.PubKey][event.ID] = true

			// Process tags
			for _, tag := range event.Tags {
				if len(tag) < 2 {
					continue
				}

				tagType := tag[0]
				tagValue := tag[1]

				switch tagType {
				case "e":
					if _, exists := db.eventsByETag[tagValue]; !exists {
						db.eventsByETag[tagValue] = make(map[string]bool)
					}
					db.eventsByETag[tagValue][event.ID] = true
				case "p":
					if _, exists := db.eventsByPTag[tagValue]; !exists {
						db.eventsByPTag[tagValue] = make(map[string]bool)
					}
					db.eventsByPTag[tagValue][event.ID] = true
				case "a":
					if _, exists := db.eventsByATag[tagValue]; !exists {
						db.eventsByATag[tagValue] = make(map[string]bool)
					}
					db.eventsByATag[tagValue][event.ID] = true
				case "d":
					if _, exists := db.eventsByDTag[tagValue]; !exists {
						db.eventsByDTag[tagValue] = make(map[string]bool)
					}
					db.eventsByDTag[tagValue][event.ID] = true
				}
			}
		}

		db.isInitialized = true
		fmt.Printf("In-memory database initialized with %d events and %d profiles\n",
			eventCount, profileCount)
		return nil

	case err := <-errCh:
		return err
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

func (db *NostrDB) QueryEventsForRequests(requests []types.Request, cacheOnly bool) ([]types.Request, []types.ParsedEvent, error) {
	if len(requests) == 0 {
		return []types.Request{}, []types.ParsedEvent{}, nil
	}

	type queryResult struct {
		events   []types.ParsedEvent
		request  types.Request
		err      error
		position int // maintain original position for stable ordering
	}

	resultChan := make(chan queryResult, len(requests))

	// Launch a goroutine for each request
	for i, req := range requests {
		go func(pos int, request types.Request) {
			filter := nostr.Filter{
				IDs:     request.IDs,
				Authors: request.Authors,
				Kinds:   request.Kinds,
				Tags:    request.Tags,
				Since:   request.Since,
				Until:   request.Until,
				Limit:   request.Limit,
				Search:  request.Search,
			}

			// Query the database for events matching the filter
			events, err := db.QueryEvents(filter)

			resultChan <- queryResult{
				events:   events,
				request:  request,
				err:      err,
				position: pos,
			}
		}(i, req)
	}

	// Collect all results
	var allEvents []types.ParsedEvent
	filteredRequests := make([]types.Request, 0)
	results := make([]queryResult, 0, len(requests))

	// Wait for all goroutines to complete
	for i := 0; i < len(requests); i++ {
		result := <-resultChan
		if result.err != nil {
			return nil, nil, result.err
		}
		results = append(results, result)
	}

	// Sort results by original position for stable output
	sort.Slice(results, func(i, j int) bool {
		return results[i].position < results[j].position
	})

	// Process results in original order
	for _, result := range results {
		// Add events to the combined result
		allEvents = append(allEvents, result.events...)

		// Determine if this request should be forwarded to network
		if !cacheOnly {
			// If not cacheOnly mode, forward all requests
			if !result.request.CacheFirst {
				filteredRequests = append(filteredRequests, result.request)
			} else if len(result.events) == 0 {
				// Forward cache-first requests only if no results found
				filteredRequests = append(filteredRequests, result.request)
			}
		}
	}

	// Sort all events by creation time, newest first
	sort.Slice(allEvents, func(i, j int) bool {
		return allEvents[i].CreatedAt > allEvents[j].CreatedAt
	})

	return filteredRequests, allEvents, nil
}

// QueryEvents retrieves events that match the given filter
func (db *NostrDB) QueryEvents(filter nostr.Filter) ([]types.ParsedEvent, error) {
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

	tagFilters := []struct {
		tagKey string
		index  map[string]map[string]bool
	}{
		{"#e", db.eventsByETag},
		{"#p", db.eventsByPTag},
		{"#a", db.eventsByATag},
		{"#d", db.eventsByDTag},
		// Add other indexed tags here if needed
	}

	for _, tf := range tagFilters {
		if tagValues, ok := filter.Tags[tf.tagKey]; ok && len(tagValues) > 0 {
			currentMatches := make(map[string]bool)
			for _, value := range tagValues {
				if tagIndex, exists := tf.index[value]; exists {
					for id := range tagIndex {
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
				return []types.ParsedEvent{}, nil // Early exit
			}
		}
	}

	// Declare slice, initialize capacity smartly later
	var intermediateCandidates []ProcessedNostrEvent

	searchLower := ""
	hasSearch := filter.Search != ""
	if hasSearch {
		searchLower = strings.ToLower(filter.Search)
	}

	// Iterate either through all events or through the indexed candidates.
	if isFirstFilter {
		// No indexed filters applied. We don't have a good size estimate.
		// Start with 0 capacity; append will grow it as needed.
		intermediateCandidates = make([]ProcessedNostrEvent, 0)

		// Loop through all events in the DB
		for _, event := range db.eventsById {
			if filter.Since != nil && event.CreatedAt < *filter.Since {
				continue
			}
			if filter.Until != nil && event.CreatedAt > *filter.Until {
				continue
			}
			if hasSearch && !strings.Contains(strings.ToLower(event.Content), searchLower) {
				continue
			}

			// Event passed all checks
			intermediateCandidates = append(intermediateCandidates, event)
		}
	} else {
		// Indexed filters produced a candidate set. Use its size as the capacity.
		// This is the maximum number of events we might add in this loop.
		intermediateCandidates = make([]ProcessedNostrEvent, 0, len(candidateIDs))

		// Loop only through the IDs identified by indexed filters
		for id := range candidateIDs {
			event, exists := db.eventsById[id]
			if !exists {
				continue
			}

			if filter.Since != nil && event.CreatedAt < *filter.Since {
				continue
			}
			if filter.Until != nil && event.CreatedAt > *filter.Until {
				continue
			}
			if hasSearch && !strings.Contains(strings.ToLower(event.Content), searchLower) {
				continue
			}

			// Event passed all checks
			intermediateCandidates = append(intermediateCandidates, event)
		}
	}

	sort.Slice(intermediateCandidates, func(i, j int) bool {
		return intermediateCandidates[i].CreatedAt > intermediateCandidates[j].CreatedAt
	})

	finalCandidates := intermediateCandidates
	limit := filter.Limit
	if limit == 0 && filter.LimitZero {
		finalCandidates = []ProcessedNostrEvent{}
	} else if limit > 0 && len(finalCandidates) > limit {
		finalCandidates = finalCandidates[:limit]
	}

	// Allocate the final slice with the *exact* required size.
	result := make([]types.ParsedEvent, len(finalCandidates))
	for i, event := range finalCandidates {
		result[i] = event.ToParseEvent()
	}

	return result, nil
}

// QueryEvent retrieves the most recent event that matches the given filter
func (db *NostrDB) QueryEvent(filter nostr.Filter) (types.ParsedEvent, bool) {
	// Set limit to 1 to optimize the query if possible, but still handle multiple results
	// as QueryEvents sorts by created_at descending.
	filter.Limit = 1

	events, err := db.QueryEvents(filter)
	if err != nil {
		return types.ParsedEvent{}, false
	}

	if len(events) == 0 {
		// No event found matching the filter
		return types.ParsedEvent{}, false
	}

	// Since QueryEvents sorts by CreatedAt descending, the first event is the most recent.
	return events[0], true
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
