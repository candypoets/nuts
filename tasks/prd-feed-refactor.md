# PRD: Feed Component Architecture Refactoring

## Introduction

The current `feed.svelte` component is a 742-line monolith that handles data fetching (Nostr subscriptions), buffering/caching, pagination, search (Fuse.js), and rendering. This violates the single-responsibility principle and makes the component hard to maintain and reuse.

This refactoring inverts the architecture: **Feed becomes a pure presentation component** that receives items via props and exposes viewport state to parents. Parents handle their own data fetching, processing, and pagination strategies.

## Goals

- Simplify `feed.svelte` to a pure virtualized list renderer
- Move Nostr subscription logic to parent components
- Move search/filtering to parent components
- Move pagination triggering to parent components (via events)
- Expose `start`, `end`, `viewport`, `down` to parent for viewport-aware behaviors
- Maintain backward compatibility during migration
- Eliminate `bind:feed` two-way binding anti-pattern
- Remove `updateFeed` callback complexity

## Non-Goals

- No new composables like `useNostrSubscription()` - logic stays in parent components
- No changes to VirtualList or VirtualListBottom internals
- No changes to how Nostr events are fetched or processed
- No visual/UI changes to the feed appearance
- No changes to the existing slot structure (header, sticky-header, sticky-footer, item-content, empty-content)

## User Stories

### US-001: Create simplified Feed component with items prop
**Description:** As a developer, I want Feed to accept items as a prop so that parents control their own data.

**Acceptance Criteria:**
- [ ] Feed accepts `items` prop (generic array, default `[]`)
- [ ] Feed accepts `getItemId` prop for unique identification
- [ ] Remove `bind:feed` export (breaking change, documented)
- [ ] Remove `subscriptionID`, `requests`, `subscriptionOptions` props
- [ ] Remove `updateFeed` callback prop
- [ ] Remove `initialItems` prop (parent passes via `items`)
- [ ] Typecheck passes
- [ ] Verify existing usages still work after migration

### US-002: Expose viewport state to parent
**Description:** As a developer, I want to access `start`, `end`, `down`, and `viewport` from the parent so I can implement viewport-aware features.

**Acceptance Criteria:**
- [ ] Export `start`, `end`, `down`, `viewport` with `bind:` for two-way binding
- [ ] `start` - first visible item index
- [ ] `end` - last visible item index
- [ ] `down` - boolean indicating scroll direction
- [ ] `viewport` - the scrollable DOM element
- [ ] Parent can read these values to trigger pagination, batching, etc.
- [ ] Typecheck passes

### US-003: Add onNearBottom event for pagination
**Description:** As a developer, I want Feed to emit an event when the user scrolls near the bottom so I can load more items.

**Acceptance Criteria:**
- [ ] Feed emits `onNearBottom` event when `end` is within 10 items of `items.length`
- [ ] Event includes `{ distance: number }` indicating items remaining
- [ ] Parent implements its own pagination logic (Nostr until/since, offset/limit, etc.)
- [ ] Remove internal pagination logic (startPage, finalizePage, until/since calculation)
- [ ] Typecheck passes

### US-004: Add onRefresh event for pull-to-refresh
**Description:** As a developer, I want Feed to emit an event on pull-to-refresh so parents can refresh their data.

**Acceptance Criteria:**
- [ ] Feed accepts `onRefresh` callback prop
- [ ] When user pulls to refresh, call `onRefresh()` instead of internal `refreshHead()`
- [ ] Parent implements refresh logic (new subscription, cache clear, etc.)
- [ ] Show loading state during refresh if `loading` prop is true
- [ ] Typecheck passes

### US-005: Remove Fuse.js search from Feed
**Description:** As a developer, I want to handle search/filtering in the parent so Feed is not coupled to search logic.

**Acceptance Criteria:**
- [ ] Remove `fuseKeys`, `fuseResolver`, `search` props
- [ ] Remove Fuse.js dependency from Feed
- [ ] Remove `filteredFeed` internal state
- [ ] Parent filters `items` before passing to Feed
- [ ] Typecheck passes

### US-006: Remove connectionStatus binding
**Description:** As a developer, I want to track connection status in the parent rather than binding it from Feed.

**Acceptance Criteria:**
- [ ] Remove `bind:connectionStatus` prop
- [ ] Parent tracks connection status via its own subscription handlers
- [ ] No changes to how connection status is displayed (RelaysList in parent)
- [ ] Typecheck passes

### US-007: Migrate explore/index.svelte to new Feed API
**Description:** As a developer, I want to migrate the main explore feed to use the new simplified Feed component.

**Acceptance Criteria:**
- [ ] Add subscription handling in parent (move from Feed)
- [ ] Implement `onNearBottom` handler with quantile-based pagination
- [ ] Implement `onRefresh` handler for pull-to-refresh
- [ ] Use `bind:start` to detect when user is at top (for batchNewItems behavior)
- [ ] Pass processed feed as `items` prop
- [ ] Remove `bind:feed` usage
- [ ] Typecheck passes
- [ ] Verify in browser: scroll, pagination, refresh all work

### US-008: Migrate notifications/index.svelte to new Feed API
**Description:** As a developer, I want to migrate the notifications page to use the new Feed component.

**Acceptance Criteria:**
- [ ] Move `updateFeed` logic (grouping by type) to parent
- [ ] Process events into `items` array in parent
- [ ] Remove `updateFeed` prop usage
- [ ] Pass grouped notifications as `items` prop
- [ ] No pagination needed (limited set)
- [ ] Typecheck passes
- [ ] Verify in browser: notifications display correctly

### US-009: Migrate chat/index.svelte to new Feed API
**Description:** As a developer, I want to migrate the chat conversations list to use the new Feed component.

**Acceptance Criteria:**
- [ ] Move DM processing logic (group by chatId) to parent
- [ ] Move `uniqBy` deduplication to parent
- [ ] Process events into `items` array in parent
- [ ] Remove `bind:feed` usage
- [ ] Remove `updateFeed` prop usage
- [ ] Typecheck passes
- [ ] Verify in browser: conversations list correctly

### US-010: Migrate _kinds/kind4.svelte to new Feed API
**Description:** As a developer, I want to migrate the DM conversation view to use the new Feed component.

**Acceptance Criteria:**
- [ ] Move nonce-based deduplication logic to parent
- [ ] Handle optimistic UI (sent messages) in parent
- [ ] Process events into `items` array in parent
- [ ] Remove `bind:feed` usage
- [ ] Use `bottom` prop for VirtualListBottom (chat bubbles)
- [ ] Typecheck passes
- [ ] Verify in browser: send/receive messages work

### US-011: Migrate home/+layout.svelte to new Feed API
**Description:** As a developer, I want to migrate the home/wallet feed to use the new Feed component.

**Acceptance Criteria:**
- [ ] Move kind9321 filtering to parent
- [ ] Sort items in parent before passing to Feed
- [ ] Remove `bind:feed` usage
- [ ] Remove `updateFeed` prop usage
- [ ] Typecheck passes
- [ ] Verify in browser: wallet feed displays correctly

### US-012: Migrate modals (send, newchat, share, followlists) to new Feed API
**Description:** As a developer, I want to migrate modal feeds to use the new Feed component.

**Acceptance Criteria:**
- [ ] **send.svelte**: Move contact dedupe/sorting to parent
- [ ] **newchat.svelte**: Move contact dedupe/sorting to parent  
- [ ] **share.svelte**: Move contact dedupe to parent, handle grid items
- [ ] **followlists.svelte**: Move kind39089 filtering to parent
- [ ] All pass `items` prop instead of `bind:feed`
- [ ] All remove `updateFeed` prop usage
- [ ] All remove `fuseKeys`/`fuseResolver`/`search` (parent handles search)
- [ ] Typecheck passes
- [ ] Verify in browser: all modals work correctly

### US-013: Migrate _kinds/kind0.svelte and kind1.svelte to new Feed API
**Description:** As a developer, I want to migrate profile and thread views to use the new Feed component.

**Acceptance Criteria:**
- [ ] **kind0.svelte**: Move feed request building to parent, pass `items`
- [ ] **kind1.svelte**: Move reply filtering to parent, pass `items`
- [ ] Both remove `bind:feed` usage
- [ ] Both remove `updateFeed` prop usage
- [ ] Typecheck passes
- [ ] Verify in browser: profile posts and thread replies work

### US-014: Clean up old Feed code
**Description:** As a developer, I want to remove all obsolete code from Feed after migration.

**Acceptance Criteria:**
- [ ] Remove `handleEvents` function (~150 lines)
- [ ] Remove `subscribe`/`unsubscribe` functions
- [ ] Remove buffer Maps (cachedMap, fetchedMap, bufferMap, pendingNewItems)
- [ ] Remove pagination state (currentPage, lastUntil, etc.)
- [ ] Remove Fuse.js search logic
- [ ] Remove internal `refreshHead`, `mergePendingItems`, `setBufferFeed` functions
- [ ] Remove `kinds` filtering (parent handles)
- [ ] Keep: VirtualList rendering, slots, sticky header/footer CSS, `start`/`end`/`down`/`viewport` binding
- [ ] Typecheck passes
- [ ] Final verification: all 12 Feed usages work correctly

## Functional Requirements

- FR-1: Feed component shall accept `items` prop as the source of truth for rendered items
- FR-2: Feed shall expose `start`, `end`, `down`, `viewport` via `bind:` for parent access
- FR-3: Feed shall emit `onNearBottom` event when user scrolls within 10 items of the end
- FR-4: Feed shall accept `onRefresh` callback for pull-to-refresh handling
- FR-5: Feed shall accept `loading` prop to control loading backdrop
- FR-6: Feed shall remove all Nostr subscription handling (useSubscription, requests, subscriptionOptions)
- FR-7: Feed shall remove all search/filtering (fuseKeys, fuseResolver, search props)
- FR-8: Feed shall remove all pagination logic (internal page tracking, until/since calculation)
- FR-9: Feed shall remove `bind:feed` two-way binding
- FR-10: Feed shall remove `updateFeed` callback
- FR-11: Feed shall maintain existing slot API: `header`, `sticky-header`, `sticky-footer`, `fixed-header`, `item-content`, `empty-content`
- FR-12: Feed shall maintain existing visual props: `visible`, `backdrop`, `itemHeight`, `itemsPerRow`, `pullToRefresh`, `stickyFooterVisible`, `bottom`
- FR-13: All parent components shall migrate to new API without functional regression

## Design Considerations

- **Slot API remains unchanged** - Parents use same slot names
- **Sticky header/footer CSS remains** - Visual behavior unchanged
- **VirtualList integration unchanged** - Still supports `itemsPerRow` for grids
- **Placeholder component still used** for viewport optimization

## Technical Considerations

- **Dependencies to remove from Feed**: `useSubscription`, `Fuse.js`, `@candypoets/nipworker` imports (keep types)
- **State to keep in Feed**: `start`, `end`, `down`, `viewport`, `loading` (prop-driven)
- **Migration strategy**: Migrate one parent at a time, test thoroughly before next
- **Breaking changes**: Document all prop removals for future reference

## Success Metrics

- Feed component reduced from ~742 lines to ~200-300 lines
- No Nostr-specific logic remains in Feed
- No two-way binding (`bind:feed`) in any parent
- All 12 usages migrated and working
- TypeScript type checking passes for all files
- No visual or behavioral regressions in any feed

## Migration Order

1. **US-001 through US-006**: Prepare new Feed component
2. **US-007**: explore/index.svelte (most complex pagination)
3. **US-008**: notifications/index.svelte (complex processing)
4. **US-009**: chat/index.svelte (complex grouping)
5. **US-010**: _kinds/kind4.svelte (optimistic UI)
6. **US-011**: home/+layout.svelte (wallet feed)
7. **US-012**: All modals (send, newchat, share, followlists)
8. **US-013**: _kinds/kind0.svelte, kind1.svelte
9. **US-014**: Clean up old code

## Open Questions

- Should we keep `batchNewItems` behavior as a prop, or let parent implement with `bind:start`?
- How to handle `headerItem` prop used in some parents (kind1, tags)?
- Should `onNearBottom` threshold be configurable (currently hardcoded 10 items)?
