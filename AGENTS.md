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
	$: isMedia = fbArray(parsed, 'contentBlocks').some((b) => b.type() === 'image');
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
	} catch {}

	sub = useSubscription(
		'sub_' + noteId,
		[
			{
				kinds: [1],
				ids: [noteId],
				limit: 1,
				relays: relayHints,
				cacheFirst: true
			}
		],
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

## Badge Products and Fulfillment

Nuts uses the NIP-58 badge model as a generic product and entitlement workflow:

- Kind `30009` is the product, pass, membership, role, or other entitlement definition.
- Kind `8` awards the holder the right to that product or entitlement.
- Kind `27237` records the status of one use of a kind `8` award.
- The implemented/custom kind is `27237`, **not** `27327`.

This same model applies across community types. A limited-entry gym pass, event ticket,
drink, prepared food item, or merchandise pickup are all badge-backed entitlements.
Do not introduce a separate product-listing event merely because the entitlement is a
physical item.

Classify every definition with both `type` and its matching `t` topic. Buyable
definitions also carry `t=sellable`. The `store` admin permission authorizes
publishing products, passes, and paid memberships; paid event tickets use the
`events` permission because they are created as part of an event.

A buyable definition is valid when its author is either a root community admin from
the relay's configured admin pubkeys, or currently holds an active role whose
definition grants the required `store` or `events` permission. Resolve that role
definition and kind `8` role award from the community relay. Do not add a parallel
HTTP endpoint or invite format for definition authorization.

### Kind 27237 Badge Status

Supported statuses are:

```typescript
type BadgeStatus = 'pending' | 'accepted' | 'processing' | 'ready' | 'fulfilled' | 'cancelled';
```

Publish only the states required by the product workflow. A gym or event check-in goes
directly to `fulfilled`; it does not need to publish the intermediate states. A
restaurant may use `pending` -> `accepted` -> `processing` -> `ready` -> `fulfilled`,
or skip states that do not add value. `cancelled` means that fulfillment will not
complete. Do not add refund, packing, or offline-redemption states.

Each use/order has a stable fulfillment identifier. Every update for that use carries
the same context tag: use `event` with the event coordinate for admission, or `order`
with the order ID for a store order. The latest valid event for the same award and
context is its current status; use `created_at`, then event ID as a deterministic
tie-breaker.

```json
{
	"kind": 27237,
	"tags": [
		["status", "<badge-status>"],
		["a", "30009:<issuer-pubkey>:<definition-d>"],
		["e", "<kind-8-award-event-id>"],
		["p", "<holder-pubkey>"],
		["event", "<event-coordinate>"]
	]
}
```

Kind `27237` itself identifies a badge status event. It must carry a valid `status`
tag. Do not add a `type` or `uses` tag.

### Derived State

- A kind `8` award with remaining uses is outstanding/available.
- One fulfillment whose latest status is `fulfilled` equals one use.
- `remaining uses = max_uses - fulfilled fulfillment count`.
- A definition without `max_uses` is unlimited, except `type=product`, which defaults
  to one use. New product definitions publish `max_uses=1` explicitly. A valid
  `type=event_access` definition must publish `max_uses=1`.
- The award is exhausted when the fulfilled fulfillment count reaches `max_uses`.
- Expiration and issuer revocation are derived independently and make an award unusable.
- Only status events signed by the community authority or an authorized staff signer
  should be accepted.

UI language may adapt statuses to the product. For example, `fulfilled` can appear as:

- Gym or event: Checked in
- Drink or food: Served
- Merchandise: Collected

The `/redeem` payment/invite workflow issues the kind `8` entitlement. For paid
entitlements, the award is signed by the community redemption service advertised as
`badge_issuer` by `/community/info`; its `a` tag still references the authorized
admin's kind `30009` definition. Consumers and scanners must trust that advertised
community issuer for the award and must not require the award signer to equal the
definition author. Kind `27237` fulfills one use of that entitlement. Keep these two
stages distinct.

Kind `30009` is addressable and may be updated in place for price, image, description,
availability, or other product metadata. Use a new `d` identifier only when creating a
meaningfully different product or entitlement.
