//go:build js && wasm
// +build js,wasm

package subscriptions

import (
	"context"
	"sync"
	"time"

	"github.com/candypoets/nutscash/nostr/types"
)

// subscription implements the Subscription interface
type subscription struct {
	id         string
	ctx        context.Context
	cancelFunc context.CancelFunc
	sentEvents map[string]*[]types.ParsedEvent
	mutex      sync.RWMutex
	createdAt  time.Time
	
	// FETCHED_EVENT batching fields
	fetchedBatch    [][]types.ParsedEvent
	batchingMode    bool
}

// NewSubscription creates a new subscription
func NewSubscription(id string) Subscription {
	ctx, cancel := context.WithCancel(context.Background())
	return &subscription{
		id:              id,
		ctx:             ctx,
		cancelFunc:      cancel,
		sentEvents:      make(map[string]*[]types.ParsedEvent),
		createdAt:       time.Now(),
		fetchedBatch:    make([][]types.ParsedEvent, 0),
		batchingMode:    true, // Start in batching mode
	}
}

func (s *subscription) ID() string {
	return s.id
}

func (s *subscription) Cancel() {
	s.cancelFunc()
}

func (s *subscription) IsCancelled() bool {
	select {
	case <-s.ctx.Done():
		return true
	default:
		return false
	}
}

func (s *subscription) GetSentEvents() map[string]*[]types.ParsedEvent {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	// Return a copy to prevent external mutation
	result := make(map[string]*[]types.ParsedEvent, len(s.sentEvents))
	for k, v := range s.sentEvents {
		if v != nil {
			eventsCopy := make([]types.ParsedEvent, len(*v))
			copy(eventsCopy, *v)
			result[k] = &eventsCopy
		}
	}
	return result
}

func (s *subscription) MarkEventAsSent(eventID string, events []types.ParsedEvent) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	eventsCopy := make([]types.ParsedEvent, len(events))
	copy(eventsCopy, events)
	s.sentEvents[eventID] = &eventsCopy
}

func (s *subscription) HasEventBeenSent(eventID string) bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	_, exists := s.sentEvents[eventID]
	return exists
}

func (s *subscription) AppendToSentEvent(eventID string, event types.ParsedEvent) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.sentEvents[eventID] == nil {
		s.sentEvents[eventID] = &[]types.ParsedEvent{event}
	} else {
		*s.sentEvents[eventID] = append(*s.sentEvents[eventID], event)
	}
}

func (s *subscription) UpdateSentEvent(eventID string, event types.ParsedEvent) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.sentEvents[eventID] != nil && len(*s.sentEvents[eventID]) > 0 {
		(*s.sentEvents[eventID])[0] = event
	}
}

func (s *subscription) Context() context.Context {
	return s.ctx
}

func (s *subscription) CreatedAt() time.Time {
	return s.createdAt
}

// FETCHED_EVENT batching methods
func (s *subscription) AddToFetchedBatch(events []types.ParsedEvent) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	
	s.fetchedBatch = append(s.fetchedBatch, events)
}

func (s *subscription) GetFetchedBatch() [][]types.ParsedEvent {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	
	// Return a copy to prevent external mutation
	result := make([][]types.ParsedEvent, len(s.fetchedBatch))
	for i, events := range s.fetchedBatch {
		eventsCopy := make([]types.ParsedEvent, len(events))
		copy(eventsCopy, events)
		result[i] = eventsCopy
	}
	return result
}

func (s *subscription) ClearFetchedBatch() {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	
	s.fetchedBatch = s.fetchedBatch[:0] // Reset slice but keep capacity
}



func (s *subscription) IsInBatchingMode() bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	
	return s.batchingMode
}

func (s *subscription) SetBatchingMode(batching bool) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	
	s.batchingMode = batching
}

// subscriptionRegistry implements the SubscriptionRegistry interface
type subscriptionRegistry struct {
	subscriptions map[string]Subscription
	mutex         sync.RWMutex
}

// NewSubscriptionRegistry creates a new subscription registry
func NewSubscriptionRegistry() SubscriptionRegistry {
	return &subscriptionRegistry{
		subscriptions: make(map[string]Subscription),
	}
}

func (r *subscriptionRegistry) Create(id string) Subscription {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	// Close existing subscription if it exists
	if existing, exists := r.subscriptions[id]; exists {
		existing.Cancel()
	}

	sub := NewSubscription(id)
	r.subscriptions[id] = sub
	return sub
}

func (r *subscriptionRegistry) Get(id string) (Subscription, bool) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	sub, exists := r.subscriptions[id]
	return sub, exists
}

func (r *subscriptionRegistry) Remove(id string) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	if sub, exists := r.subscriptions[id]; exists {
		sub.Cancel()
		delete(r.subscriptions, id)
	}
}

func (r *subscriptionRegistry) Count() int {
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	return len(r.subscriptions)
}

func (r *subscriptionRegistry) List() []string {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	ids := make([]string, 0, len(r.subscriptions))
	for id := range r.subscriptions {
		ids = append(ids, id)
	}
	return ids
}

func (r *subscriptionRegistry) Cleanup() {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	for id, sub := range r.subscriptions {
		if sub.IsCancelled() {
			delete(r.subscriptions, id)
		}
	}
}
