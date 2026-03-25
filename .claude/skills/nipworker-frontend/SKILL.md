---
name: nipworker-frontend
description: Use this skill when writing frontend code that consumes @candypoets/nipworker, especially when handling WorkerMessage or ParsedEvent FlatBuffers, narrowing with NarrowTypes, or preserving zero-copy message handling.
---

# NipWorker Frontend

## Overview

Use this skill for frontend integration work with `@candypoets/nipworker`.
The default posture is zero-copy FlatBuffers views, not JS object materialization.

## Workflow

1. Keep the transport types alive.
   Treat `WorkerMessage`, `ParsedEvent`, and concrete `*Parsed` tables as FlatBuffers views.
   Do not convert them into plain objects unless a boundary truly requires it.
2. Narrow before reading.
   Use helpers from `src/lib/NarrowTypes.ts`:
   `isParsedEvent`, `isNostrEvent`, `isKind0`, `isKind1`, and the other `is*/as*` helpers.
   Prefer narrowing on the `WorkerMessage`/`ParsedEvent` view you already have.
3. Read fields directly from the table.
   Pull only the fields the UI needs, and read them from the FlatBuffers object.
   Avoid building DTOs that mirror the schema just for convenience.
   If the event is only rendered inside the owning Svelte component, prefer reading the parsed view directly in the template or local branch rather than projecting it into a helper type.
4. Preserve zero-copy semantics.
   `ArrayBufferReader` already constructs `ByteBuffer` views over the existing buffer.
   Keep that path intact. Do not add `.unpack()`, `toObject()`, or JSON conversion as the default flow.
5. Cross the boundary only when necessary.
   If state must outlive the buffer, convert only that minimal slice at the edge.
   Explain why the copy is needed.

## Operating Rules

- Prefer `useSubscription` for subscription handling and `usePublish` for publish status flows.
- Treat `useSubscription` as the reactive source of truth for event-backed UI state.
- `usePublish` mutates the event graph; linked `useSubscription` callbacks are the refresh mechanism.
- Use the `useSubscription` callback to update every view state variable that matters to the UI.
- In Svelte, update local `let` variables and lists directly from the callback instead of introducing heavy reactive derived state or extra methods.
- Keep publish orchestration in the owning Svelte component. Do not route feature or modal publishes through `src/controller/*` wrappers.
- Do not wrap `usePublish` in a `Promise` just to await completion when the caller already owns the interaction.
- If reuse is needed, extract only a pure helper that turns a domain object into a valid `EventTemplate`. That helper must not call `usePublish`, manage loading state, or wait on relay acknowledgements.
- Consider a publish complete as soon as any relay returns a `true` status. Do not wait for every relay to acknowledge before clearing loading state.
- Treat `subId` as the deterministic cache key for the thing being queried.
- Reusing the same `subId` in multiple components is expected and is a `useSubscription` dedupe/cache concern, not a reason to create a shared store.
- Reuse the same `subId` for the same result set so `useSubscription` can act as the store, deduplicate requests, and expose observable state for that query.
- Change the `subId` whenever you expect a different result set, even if the UI looks similar.
- Use stable naming conventions for result families, for example `k_[pubkey]` for kind 0 profiles, `r_[eventid]` for kind 6/16 reposts/reactions, and `comment_[eventid]` for kind 1111 comments.
- Write tag filters as nested query data, not as flattened request params: `tags: { '#d': [ids] }`.
- Treat tags as sub-objects inside each query object when building requests.
- Do not reimplement a parallel store layer here; the subscription buffer and dedup behavior are already built into `useSubscription`.
- Only introduce a shared store for stable app-wide inputs or canonical projections used to build further subscriptions across the app.
- Do not create stores that merely mirror subscription output or publish results for a single modal, page, or feature flow, even if several components in that flow subscribe to the same `subId`.
- Let the hook own fetching and dedupe, and let components own the projection from parsed events into local or shared state.
- If a live-data behavior needs reuse across screens, extract a Svelte component that owns its own `useSubscription` call and local projection state; do not move that projection into a shared store or standalone `.ts` helper module.
- Do not outsource publish methods to controller modules for feature UI. Shared code may only create event templates or other pure data structures that the component then publishes.
- Avoid parsing `content` or flattening to DTOs when the tag fields already carry the needed data.
- Use extractTag, extractTagValue, extractTagValues, and extractTagMap from src/lib/NostrUtils.ts for tag access instead of repeated scans.
- Pass the where predicate when you need to filter repeated tags by marker or relay fields in tag[2], tag[3], and beyond.
- For live match comments or other component-local event views, consume the parsed FlatBuffers event in place unless the data must outlive the buffer or be shared across a boundary.
- Always unsubscribe or clean up listeners when the UI scope ends.
- Do not parse FlatBuffers into a JS tree just to inspect event kind or message type.
- Do not write helpers that hide the FlatBuffers types behind generic plain-object wrappers.
- Use explicit encoding only when you need string materialization from FB fields.
- When a component renders from the parsed event directly, keep the FlatBuffers view in scope and read the needed fields in the template or the local branch instead of converting it into a helper object first.
- If the code needs a stable app model, keep the copy small and localized.

## Kind0 Field Access

For Kind0 (profile) events, use `asKind0(parsedEvent)` to get the parsed profile. Fields are accessed via methods:

```ts
import { asKind0 } from '@candypoets/nipworker/utils';
import { Encoding } from 'flatbuffers';

const kind0 = asKind0(parsedEvent);
if (kind0) {
  const name = kind0.name(); // or kind0.name(Encoding.UTF8_STRING)
  const displayName = kind0.displayName();
  const nip05 = kind0.nip05();
  const picture = kind0.picture();
  const about = kind0.about();
}
```

**Available Kind0 fields (methods):**
- `pubkey()` - Pubkey
- `name()` - Username/name
- `displayName()` - Display name
- `displayNameAlt()` - Alternative display name
- `picture()` - Profile picture URL
- `banner()` - Banner image URL
- `about()` - Bio/about text
- `website()` - Website URL
- `nip05()` - NIP-05 identifier
- `lud06()` - LNURL-pay
- `lud16()` - Lightning address
- `github()` - GitHub handle
- `twitter()` - Twitter handle
- `mastodon()` - Mastodon handle
- `nostr()` - Nostr reference
- `username()` - Username alias
- `bio()` - Bio alias
- `image()` - Image alias
- `avatar()` - Avatar alias
- `background()` - Background alias

## Practical Pattern

```ts
import { isParsedEvent, asKind1 } from '@candypoets/nipworker/utils';
import type { WorkerMessage } from '@candypoets/nipworker/types';
import { Encoding } from 'flatbuffers';

function handleMessage(msg: WorkerMessage) {
        const parsed = isParsedEvent(msg);
        if (!parsed) return;

        const kind1 = asKind1(parsed);
        if (!kind1) return;

        const content = kind1.content(Encoding.UTF8_BYTES) ?? '';
        renderNote(content);
}
```

## Red Flags

- Calling `.unpack()` on generated tables in the hot path.
- Turning every worker message into a plain JS object before rendering.
- Losing the FlatBuffers view before all needed fields are read.
- Adding abstraction layers that make it impossible to see whether code is zero-copy.
- Waiting for every relay acknowledgement before clearing publish loading state.
- Routing a feature publish through a controller module instead of the Svelte component that owns the interaction.
- Wrapping `usePublish` in a Promise when the triggering Svelte event handler can own the callback directly.

## References

- See `src/lib/NarrowTypes.ts` for the available narrowing helpers.
- See `src/lib/ArrayBufferReader.ts` for the zero-copy `ByteBuffer` read path.
- See `src/hooks.ts` for the subscription and publish entry points.
