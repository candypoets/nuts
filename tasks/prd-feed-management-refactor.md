# PRD: Feed Management Refactor

## Introduction

Refactor the complex `feed.svelte` component to use a simplified, reactive architecture. Currently, the feed uses 4 separate Maps (`cachedMap`, `fetchedMap`, `bufferMap`, `pendingNewItems`) with complex phase tracking (`eoce`, `eose`). This refactor consolidates to a single `items` Map with a `FeedItem` wrapper, unified buffering logic, and fixed-window pagination that doesn't rely on fragile feed timestamps.

## Goals

- Replace 4 buffer Maps with 1 unified `items` Map
- Simplify subscription lifecycle (cache → backfill → live)
- Implement unified "Load X new items" buffering for both backfill and live events
- Support "eager mode" when no cached content exists (show fresh events immediately)
- Replace quantile-based pagination with fixed-window tracking (independent of feed content)
- Maintain all existing user-facing behaviors

## User Stories

### US-001: Create FeedItem type and unified items Map
**Description:** As a developer, I need a single data structure to hold all feed items with metadata about their source.

**Acceptance Criteria:**
- [ ] Create `FeedItem` interface with `event`, `source`, `receivedAt` fields
- [ ] Replace `cachedMap`, `fetchedMap`, `bufferMap`, `pendingNewItems` with single `items: Map<number, FeedItem>`
- [ ] Type `source` as `'cache' | 'backfill' | 'live' | 'page'`
- [ ] Update all references to use `items.get(id)` instead of buffer-specific Maps
- [ ] Typecheck passes

### US-002: Implement unified message handler
**Description:** As a developer, I need a single handler that routes events based on source type.

**Acceptance Criteria:**
- [ ] Create `handleMessage(msg: WorkerMessage, source: Source)` function
- [ ] Handle cache events: show immediately, update `viewAnchor`
- [ ] Handle backfill/live events: store in items Map, buffer for "Load X new" button
- [ ] Handle page events: store with source 'page', update pagination cursor
- [ ] Prevent duplicate events using `seen_ids` or Map key check
- [ ] Typecheck passes

### US-003: Implement "Load X new items" reactive logic
**Description:** As a user, I want to see a button showing how many new items are buffered, and click it to reveal them.

**Acceptance Criteria:**
- [ ] Create reactive `$: pendingNew` count based on items with `source: 'backfill' | 'live'` where `event.createdAt() > viewAnchor`
- [ ] Create `loadNewItems()` function that updates `viewAnchor` to `now()`
- [ ] Create reactive `$: visibleItems` that filters items based on `viewAnchor`
- [ ] Create reactive `$: feed = visibleItems.map(i => i.event)` for VirtualList
- [ ] Button appears when `pendingNew > 0` with correct count
- [ ] Clicking button reveals items and scrolls to top
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Implement eager mode for empty cache
**Description:** As a user returning after a long absence with no cache, I want to see fresh events immediately without clicking "Load X new".

**Acceptance Criteria:**
- [ ] Track `hasCachedContent` boolean
- [ ] Set to true on EOCE if any cache items were received
- [ ] In `handleMessage`, when `source === 'backfill' | 'live'` AND `!hasCachedContent`, update `viewAnchor` immediately (eager mode)
- [ ] When `hasCachedContent` is true, buffer as normal
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Implement simplified subscription lifecycle
**Description:** As a developer, I need clean subscription management for cache → backfill → live phases.

**Acceptance Criteria:**
- [ ] Create `initFeed()` that starts cache subscription
- [ ] On EOCE, start backfill subscription with `since: viewAnchor`
- [ ] On EOSE from backfill, start live subscription with `since: now()`
- [ ] Store unsubscribe functions: `cacheSub`, `backfillSub`, `liveSub`
- [ ] Cleanup all subscriptions in `onDestroy`
- [ ] Typecheck passes

### US-006: Implement fixed-window pagination
**Description:** As a developer, I need pagination that doesn't rely on fragile feed timestamps.

**Acceptance Criteria:**
- [ ] Track `paginationAnchor: number | null` (completely separate from feed content)
- [ ] Initialize `paginationAnchor` to `now()` on first load
- [ ] Implement `loadMore()` with expanding window: `window = ONE_DAY * 2^noResultsCount`
- [ ] Use `until = paginationAnchor - 1`, `since = until - window`
- [ ] On successful page: update `paginationAnchor` to oldest received item's timestamp
- [ ] On empty page: increment `noResultsCount`, keep same anchor, expand window
- [ ] Trigger pagination when user scrolls near bottom (`end >= feed.length - 5`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Integrate with existing VirtualList and UI
**Description:** As a user, I want the refactored feed to look and behave exactly like before.

**Acceptance Criteria:**
- [ ] VirtualList receives reactive `feed` array
- [ ] Sticky header/footer work with new `pendingNew` count
- [ ] Pull-to-refresh triggers `refreshHead()` which merges pending items
- [ ] Pagination loading state shows correctly
- [ ] Empty state displays when feed is empty
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Single `items: Map<number, FeedItem>` replaces all buffer Maps
- FR-2: `viewAnchor` timestamp gates which items are visible (items with `createdAt <= viewAnchor`)
- FR-3: Backfill and live events are buffered when `hasCachedContent` is true
- FR-4: Backfill and live events show immediately when `hasCachedContent` is false (eager mode)
- FR-5: Pagination uses fixed-window tracking independent of feed content
- FR-6: Pagination window expands exponentially on empty results (1d → 2d → 4d → 8d...)
- FR-7: All existing props (`subscriptionID`, `requests`, `initialItems`, etc.) continue to work
- FR-8: Memory cap (10000 items) is preserved

## Non-Goals

- No changes to the `useSubscription` hook from `@candypoets/nipworker`
- No changes to VirtualList component
- No changes to Note component or item rendering
- No changes to search/fuse filtering logic
- No server-side changes

## Technical Considerations

- Use Svelte's reactive declarations (`$:`) for derived state
- Keep subscription IDs consistent with existing pattern (`${subscriptionID}_cache`, etc.)
- Maintain compatibility with existing `updateFeed` callback prop
- Preserve `seen_ids` Set for deduplication across all sources

## Success Metrics

- Code complexity reduced: fewer Maps, fewer flags, simpler logic
- No regression in feed loading behavior
- "Load X new items" works for both backfill (return after day) and live updates
- Pagination loads older items without gaps

## Open Questions

- Should we persist `viewAnchor` to localStorage so returning users see what they last viewed?
- Should pagination window have a maximum cap (e.g., 30 days) to prevent excessive queries?
