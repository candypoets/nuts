//go:build js && wasm
// +build js,wasm

package db

import (
	"testing"
	"time"

	"github.com/nbd-wtf/go-nostr"
	"github.com/stretchr/testify/assert"
)

// createTestDB creates a test database with some fake events
func createTestDB() *NostrDB {
	testDB := &NostrDB{
		eventsById:       make(map[string]ProcessedNostrEvent),
		eventsByKind:     make(map[int]map[string]bool),
		eventsByPubkey:   make(map[string]map[string]bool),
		eventsByETag:     make(map[string]map[string]bool),
		eventsByPTag:     make(map[string]map[string]bool),
		eventsByATag:     make(map[string]map[string]bool),
		eventsByDTag:     make(map[string]map[string]bool),
		profilesByPubkey: make(map[string]ProcessedNostrEvent),
		isInitialized:    true,
	}

	// Create some fake events
	events := []ProcessedNostrEvent{
		// Profile events (kind 0)
		{
			NostrEvent: NostrEvent{
				ID:        "profile1",
				PubKey:    "pub1",
				CreatedAt: nostr.Timestamp(time.Now().Unix() - 3600),
				Kind:      0,
				Content:   `{"name":"User 1","about":"Test user 1"}`,
				Sig:       "sig1",
			},
		},
		{
			NostrEvent: NostrEvent{
				ID:        "profile2",
				PubKey:    "pub2",
				CreatedAt: nostr.Timestamp(time.Now().Unix() - 3500),
				Kind:      0,
				Content:   `{"name":"User 2","about":"Test user 2"}`,
				Sig:       "sig2",
			},
		},
		// Text note events (kind 1)
		{
			NostrEvent: NostrEvent{
				ID:        "note1",
				PubKey:    "pub1",
				CreatedAt: nostr.Timestamp(time.Now().Unix() - 3400),
				Kind:      1,
				Tags:      nostr.Tags{{"p", "pub2"}, {"e", "note2"}},
				Content:   "Hello from user 1!",
				Sig:       "sig3",
			},
			PTags: []string{"pub2"},
			ETags: []string{"note2"},
		},
		{
			NostrEvent: NostrEvent{
				ID:        "note2",
				PubKey:    "pub2",
				CreatedAt: nostr.Timestamp(time.Now().Unix() - 3300),
				Kind:      1,
				Tags:      nostr.Tags{{"p", "pub1"}},
				Content:   "Hello from user 2!",
				Sig:       "sig4",
			},
			PTags: []string{"pub1"},
		},
		// Reaction events (kind 7)
		{
			NostrEvent: NostrEvent{
				ID:        "reaction1",
				PubKey:    "pub1",
				CreatedAt: nostr.Timestamp(time.Now().Unix() - 3200),
				Kind:      7,
				Tags:      nostr.Tags{{"e", "note2"}, {"p", "pub2"}},
				Content:   "+",
				Sig:       "sig5",
			},
			ETags: []string{"note2"},
			PTags: []string{"pub2"},
		},
		// Channel creation (kind 40)
		{
			NostrEvent: NostrEvent{
				ID:        "channel1",
				PubKey:    "pub1",
				CreatedAt: nostr.Timestamp(time.Now().Unix() - 3100),
				Kind:      40,
				Content:   `{"name":"Test Channel","about":"A test channel"}`,
				Sig:       "sig6",
			},
		},
		// Channel message (kind 42)
		{
			NostrEvent: NostrEvent{
				ID:        "channelmsg1",
				PubKey:    "pub2",
				CreatedAt: nostr.Timestamp(time.Now().Unix() - 3000),
				Kind:      42,
				Tags:      nostr.Tags{{"e", "channel1"}, {"a", "40:pub1:channel1"}},
				Content:   "Hello channel!",
				Sig:       "sig7",
			},
			ETags: []string{"channel1"},
			ATags: []string{"40:pub1:channel1"},
		},
		// Event with d tag
		{
			NostrEvent: NostrEvent{
				ID:        "parameterized1",
				PubKey:    "pub1",
				CreatedAt: nostr.Timestamp(time.Now().Unix() - 2900),
				Kind:      30023,
				Tags:      nostr.Tags{{"d", "test-d-tag"}},
				Content:   "Event with d tag",
				Sig:       "sig8",
			},
			DTags: []string{"test-d-tag"},
		},
	}

	// Add events to the database
	for _, event := range events {
		testDB.indexEvent(event)
	}

	return testDB
}

func TestInitNostrDB(t *testing.T) {
	// Reset the global DB variable
	DB = nil

	// Call InitNostrDB
	db := InitNostrDB()

	// Verify that DB is initialized
	assert.NotNil(t, db)
	assert.NotNil(t, DB)
	assert.Equal(t, db, DB)
}

func TestHasEvent(t *testing.T) {
	db := createTestDB()

	// Test existing event
	assert.True(t, db.HasEvent("note1"))
	assert.True(t, db.HasEvent("channel1"))

	// Test non-existing event
	assert.False(t, db.HasEvent("nonexistent"))
}

func TestGetEvent(t *testing.T) {
	db := createTestDB()

	// Test getting an existing event
	event, exists := db.GetEvent("note1")
	assert.True(t, exists)
	assert.Equal(t, "note1", event.ID)
	assert.Equal(t, "pub1", event.PubKey)
	assert.Equal(t, 1, event.Kind)

	// Test getting a non-existing event
	_, exists = db.GetEvent("nonexistent")
	assert.False(t, exists)
}

func TestGetProfile(t *testing.T) {
	db := createTestDB()

	// Test getting an existing profile
	profile, exists := db.GetProfile("pub1")
	assert.True(t, exists)
	assert.Equal(t, "profile1", profile.ID)
	assert.Equal(t, "pub1", profile.PubKey)
	assert.Equal(t, 0, profile.Kind)

	// Test getting a non-existing profile
	_, exists = db.GetProfile("nonexistent")
	assert.False(t, exists)
}

func TestQueryEvents_FilterByIDs(t *testing.T) {
	db := createTestDB()

	// Test querying by single ID
	filter := nostr.Filter{
		IDs: []string{"note1"},
	}

	events, err := db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 1)
	assert.Equal(t, "note1", events[0].ID)

	// Test querying by multiple IDs
	filter = nostr.Filter{
		IDs: []string{"note1", "note2", "nonexistent"},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 2)

	// Test querying by non-existent ID
	filter = nostr.Filter{
		IDs: []string{"nonexistent"},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 0)
}

func TestQueryEvents_FilterByKinds(t *testing.T) {
	db := createTestDB()

	// Test querying by single kind
	filter := nostr.Filter{
		Kinds: []int{1},
	}

	events, err := db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 2) // note1 and note2

	// Test querying by multiple kinds
	filter = nostr.Filter{
		Kinds: []int{0, 7},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 3) // profile1, profile2, and reaction1

	// Test querying by non-existent kind
	filter = nostr.Filter{
		Kinds: []int{999},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 0)

	// Test querying by kind and pubkey
	filter = nostr.Filter{
		Kinds:   []int{1},
		Authors: []string{"pub1"},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 1) // pub1
}

func TestQueryEvents_FilterByAuthors(t *testing.T) {
	db := createTestDB()

	// Test querying by single author
	filter := nostr.Filter{
		Authors: []string{"pub1"},
	}

	events, err := db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 5) // profile1, note1, reaction1, channel1, parameterized1

	// Test querying by multiple authors
	filter = nostr.Filter{
		Authors: []string{"pub1", "pub2"},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 8) // All events

	// Test querying by non-existent author
	filter = nostr.Filter{
		Authors: []string{"nonexistent"},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 0)
}

func TestQueryEvents_FilterByETags(t *testing.T) {
	db := createTestDB()

	// Test querying by E tags
	filter := nostr.Filter{
		Tags: map[string][]string{
			"#e": {"note2"},
		},
	}

	events, err := db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 2) // note1 and reaction1

	// Test querying by non-existent E tag
	filter = nostr.Filter{
		Tags: map[string][]string{
			"#e": {"nonexistent"},
		},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 0)
}

func TestQueryEvents_FilterByPTags(t *testing.T) {
	db := createTestDB()

	// Test querying by P tags
	filter := nostr.Filter{
		Tags: map[string][]string{
			"#p": {"pub1"},
		},
	}

	events, err := db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 1) // note2

	// Test querying by non-existent P tag
	filter = nostr.Filter{
		Tags: map[string][]string{
			"#p": {"nonexistent"},
		},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 0)
}

func TestQueryEvents_FilterByATags(t *testing.T) {
	db := createTestDB()

	// Test querying by A tags
	filter := nostr.Filter{
		Tags: map[string][]string{
			"#a": {"40:pub1:channel1"},
		},
	}

	events, err := db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 1) // channelmsg1

	// Test querying by non-existent A tag
	filter = nostr.Filter{
		Tags: map[string][]string{
			"#a": {"nonexistent"},
		},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 0)
}

func TestQueryEvents_FilterByDTags(t *testing.T) {
	db := createTestDB()

	// Test querying by D tags
	filter := nostr.Filter{
		Tags: map[string][]string{
			"#d": {"test-d-tag"},
		},
	}

	events, err := db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 1) // parameterized1

	// Test querying by non-existent D tag
	filter = nostr.Filter{
		Tags: map[string][]string{
			"#d": {"nonexistent"},
		},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 0)
}

func TestQueryEvents_CombinedFilters(t *testing.T) {
	db := createTestDB()

	// Test querying by multiple filter criteria
	filter := nostr.Filter{
		Kinds:   []int{1},
		Authors: []string{"pub1"},
	}

	events, err := db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 1) // note1

	// Test more complex filter
	filter = nostr.Filter{
		Kinds: []int{1, 7},
		Tags: map[string][]string{
			"#p": {"pub2"},
		},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 2) // note1 and reaction1

	// Test filter with no matches
	filter = nostr.Filter{
		Kinds:   []int{0},
		Authors: []string{"pub1"},
		Tags: map[string][]string{
			"#e": {"note2"},
		},
	}

	events, err = db.QueryEvents(filter)
	assert.NoError(t, err)
	assert.Len(t, events, 0)
}

func TestQueryEvents_WithLimit(t *testing.T) {
	db := createTestDB()

	// Test querying with a limit
	filter := nostr.Filter{
		Authors: []string{"pub1", "pub2"},
	}

	events, err := db.QueryEvents(filter, 3)
	assert.NoError(t, err)
	assert.Len(t, events, 3)
}

func TestAddEvent(t *testing.T) {
	db := createTestDB()

	// Create a new event to add
	newEvent := nostr.Event{
		ID:        "newevent",
		PubKey:    "pub3",
		CreatedAt: nostr.Timestamp(time.Now().Unix()),
		Kind:      1,
		Tags:      nostr.Tags{{"p", "pub1"}, {"e", "note1"}},
		Content:   "New event from pub3",
		Sig:       "sig9",
	}

	// Add the event
	err := db.AddEvent(newEvent)
	assert.NoError(t, err)

	// Verify the event was added
	addedEvent, exists := db.GetEvent("newevent")
	assert.True(t, exists)
	assert.Equal(t, "newevent", addedEvent.ID)
	assert.Equal(t, "pub3", addedEvent.PubKey)

	// Verify indexes were updated
	assert.True(t, db.eventsByKind[1]["newevent"])
	assert.True(t, db.eventsByPubkey["pub3"]["newevent"])
	assert.True(t, db.eventsByPTag["pub1"]["newevent"])
	assert.True(t, db.eventsByETag["note1"]["newevent"])
}

func TestAddEvents(t *testing.T) {
	db := createTestDB()

	// Create multiple events to add
	newEvents := []nostr.Event{
		{
			ID:        "newevent1",
			PubKey:    "pub3",
			CreatedAt: nostr.Timestamp(time.Now().Unix()),
			Kind:      1,
			Tags:      nostr.Tags{{"p", "pub1"}},
			Content:   "First new event from pub3",
			Sig:       "sig10",
		},
		{
			ID:        "newevent2",
			PubKey:    "pub3",
			CreatedAt: nostr.Timestamp(time.Now().Unix()),
			Kind:      7,
			Tags:      nostr.Tags{{"e", "note1"}, {"p", "pub1"}},
			Content:   "+",
			Sig:       "sig11",
		},
	}

	// Add the events
	ids, err := db.AddEvents(newEvents)
	assert.NoError(t, err)
	assert.Len(t, ids, 2)

	// Verify the events were added
	for _, id := range ids {
		event, exists := db.GetEvent(id)
		assert.True(t, exists)
		assert.Equal(t, "pub3", event.PubKey)
	}

	// Verify indexes were updated
	assert.True(t, db.eventsByPubkey["pub3"]["newevent1"])
	assert.True(t, db.eventsByPubkey["pub3"]["newevent2"])
	assert.True(t, db.eventsByKind[1]["newevent1"])
	assert.True(t, db.eventsByKind[7]["newevent2"])
}

func TestIsInitialized(t *testing.T) {
	db := createTestDB()

	// Test IsInitialized
	assert.True(t, db.IsInitialized())

	// Test with a new, uninitialized DB
	uninitializedDB := &NostrDB{
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
	assert.False(t, uninitializedDB.IsInitialized())
}

func TestHelperFunctions(t *testing.T) {
	// Test getIDsFromMap
	idMap := map[string]bool{
		"id1": true,
		"id2": true,
		"id3": true,
	}

	ids := getIDsFromMap(idMap)
	assert.Len(t, ids, 3)
	assert.Contains(t, ids, "id1")
	assert.Contains(t, ids, "id2")
	assert.Contains(t, ids, "id3")

	// Test intersectMaps
	mapA := map[string]bool{
		"id1": true,
		"id2": true,
		"id3": true,
	}

	mapB := map[string]bool{
		"id2": true,
		"id3": true,
		"id4": true,
	}

	intersection := intersectMaps(mapA, mapB)
	assert.Len(t, intersection, 2)
	assert.True(t, intersection["id2"])
	assert.True(t, intersection["id3"])
	assert.False(t, intersection["id1"])
	assert.False(t, intersection["id4"])

	// Test empty map intersection
	emptyMap := map[string]bool{}
	intersection = intersectMaps(mapA, emptyMap)
	assert.Len(t, intersection, 0)
}
