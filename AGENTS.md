# Agent Guidelines for nutscash

## Svelte Template Constraints

### TypeScript in Templates
**Svelte templates do NOT support TypeScript type annotations.** Use JSDoc comments instead.

```svelte
<!-- ❌ BAD: TypeScript type annotation in template -->
<button on:click={() => {
  const handler = (r: string[]) => { ... };
}}>

<!-- ✅ GOOD: JSDoc type annotation -->
<button on:click={() => {
  const handler = (/** @type {string[]} */ r) => { ... };
}}>
```

Keep TypeScript types in `<script lang="ts">` blocks only.

## NIP Worker Patterns

### Fetching Events by ID
When fetching events by ID (for replies, reposts, shares), always:

1. **Use `cacheFirst: true`** - Check cache before network
2. **Pass relay hints via nevent** - Encode the event ID as `nevent` with relay hints
3. **Use both type guards** - Check `isParsedEvent` AND `isKind1` (or appropriate kind)
4. **Proper cleanup** - Use `onDestroy` to unsubscribe

Example pattern from `kind1.svelte`:
```typescript
import { decode } from 'nostr-tools/nip19';
import { isKind1, isParsedEvent } from '@candypoets/nipworker/utils';

let sub: (() => void) | undefined;

onMount(() => {
  // Decode nevent for relay hints
  let relayHints: string[] = [];
  try {
    const decoded = decode(noteId);
    if (decoded?.type === 'nevent') {
      relayHints = decoded.data.relays || [];
    }
  } catch { }

  sub = useSubscription(
    'sub_' + noteId,
    [{
      kinds: [1],
      ids: [noteId],
      limit: 1,
      relays: relayHints,
      cacheFirst: true
    }],
    (message) => {
      const parsedEvent = isParsedEvent(message);
      const kind1 = isKind1(message);
      if (kind1 && parsedEvent?.id() === noteId) {
        note = parsedEvent;
      }
    }
  );
});

onDestroy(() => sub?.());
```

### URL Patterns
- Event detail pages: `/explore/nevent:{nevent}`
- Reply modals: `/explore/reply:{nevent}` (not raw hex ID)
- Repost modals: `/explore/repost:{nevent}` (not raw hex ID)

When creating navigation URLs in buttons, encode the event as nevent with relay hints:
```typescript
const nevent = nip19.neventEncode({ id: note.id(), relays });
go('reply:' + nevent);
```
