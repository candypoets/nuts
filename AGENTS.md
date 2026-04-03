# Agent Guidelines for nutscash

## Zero-Copy FlatBuffer Consumption

**Avoid reactive statements that just extract fields from FlatBuffers.** The whole point of FlatBuffers is zero-copy access - reading fields directly from the buffer without creating intermediate JavaScript objects.

```svelte
<!-- ❌ BAD: Creating reactive variables for every field -->
<script>
  $: parsed = asKind1(note);
  $: content = parsed?.content();  // Unnecessary copy
  $: createdAt = parsed?.createdAt();  // Unnecessary copy
  $: author = parsed?.pubkey();  // Unnecessary copy
</script>
<p>{content} by {author} at {createdAt}</p>

<!-- ✅ GOOD: Read directly from FlatBuffer view in template -->
<script>
  $: parsed = asKind1(note);
</script>
<p>{parsed?.content()} by {parsed?.pubkey()} at {parsed?.createdAt()}</p>
```

**When to use reactive statements with FlatBuffers:**
- Only when you need computed/derived state (e.g., `$: isLive = parsed?.status() === 'live'`)
- Only when the value is needed in multiple places and you want to cache the method call
- Only for DOM element bindings or event handlers that can't access the view directly

**Preferred pattern:**
```svelte
<script>
  import { asKind1, fbArray } from '@candypoets/nipworker/utils';
  
  $: parsed = asKind1(note);
  
  // Only reactive for actual computed values
  $: isMedia = fbArray(parsed, 'contentBlocks').some(b => b.type() === 'image');
</script>

<!-- Access FlatBuffer fields directly in template -->
{#if parsed?.title()}
  <h1>{parsed.title()}</h1>
{/if}
```

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

## Module Import Patterns

### Avoid Runtime Dynamic Imports
This is a **Vite application** - use static imports at the top of files. Runtime `import()` is unnecessary and adds complexity.

```typescript
// ❌ BAD: Runtime dynamic import
const { useSubscription } = await import('@candypoets/nipworker/hooks');

// ✅ GOOD: Static import at top of file
import { useSubscription } from '@candypoets/nipworker/hooks';
```

Vite handles tree-shaking and code splitting automatically. Only use dynamic imports for:
- True code-splitting (lazy-loaded routes/components)
- Conditional loading of large libraries that may not be needed

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
