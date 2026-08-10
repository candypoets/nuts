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

## Entitlements, Roles and Memberships (NIP-97)

The governing spec for this system is **NIP-97 (draft)** on this machine at
`~/nips/97.md` — "Badge-Based Entitlements and Community Access Control". Read
it before working in this area. This section is the working summary.

**Transition note:** parts of the code still implement the pre-NIP model
(everything on `30009` with `type` topics, text permissions like `store`, trust
via NIP-11 scraping + `/community/info`). When you touch this area, converge it
toward NIP-97 and update this section. Do not extend the legacy model.

### Kinds

| kind            | role                                                             | source |
| --------------- | ---------------------------------------------------------------- | ------ |
| `31727`         | community anchor (root-signed: admins, `badge_issuer`, metadata) | NIP-97 |
| `30009`         | role and membership definitions (+ `permission`, `price` tags)   | NIP-58 |
| `30402`         | products, passes, tickets (+ `max_uses`)                         | NIP-99 |
| `31922`/`31923` | calendar events                                                  | NIP-52 |
| `31925`         | RSVPs                                                            | NIP-52 |
| `8`             | award — the uniform entitlement token                            | NIP-58 |
| `37237`         | fulfillment status of one award use                              | NIP-97 |

### Trust chain

1. The community relay's NIP-11 `pubkey` is the **root key** — the only
   out-of-band fact.
2. The **anchor** (kind `31727`, `d=community`, signed by the root key) lists
   admin pubkeys as `p` tags and an optional `badge_issuer` delegated key.
   Rotation = publish a new anchor version.
3. Awards of definitions **with** a `price` tag may be signed by an anchor
   admin or the `badge_issuer`; awards of definitions **without** `price` must
   be signed by an anchor admin.
4. Revocation is a NIP-09 `kind:5` deletion referencing the award, signed by
   the issuer or an anchor admin. Banning a member = deleting their membership
   award.

All verification is pinned to the community relay: anchor, definitions, awards,
and status events MUST be resolved from the relay whose NIP-11 identifies the
community. Copied events on foreign relays carry no authority. Do not add
parallel HTTP endpoints or invite formats for authorization.

### Roles and memberships (kind `30009`)

One mechanism: a definition carrying `permission` tags, conferring capabilities
on award holders. `["t", "role"]` = internal capability grant;
`["t", "membership"]` = standing access. A definition with a `price` tag
(NIP-99 format: `["price", "15", "EUR", "month"]`) is sellable — that is what
makes a membership paid.

Capabilities are kind-scoped, following the NIP-65 read/write marker
convention:

```json
["permission", "<kind-number>", "<read|write>", "<t-filter>"]
```

- 3rd element optional; absent = read and write.
- 4th element optional: required `t` topic on the written event. Only used on
  `30009`, e.g. `["permission", "30009", "write", "membership"]`.
- Publishing `30009` with `t=role` is reserved for anchor admins; never grant
  it via `permission` tags (privilege-escalation boundary).

Conventional assignments: `1` write = posting, `31923` write = events,
`30402` write = store, `37237` write = fulfillment staff. The 2nd element may
also be a non-numeric **named capability** for off-relay features (`invites`,
`moderation`, `settings`) — meaningful only to app software; relays and gates
ignore permissions they cannot evaluate.

### Products, passes, tickets (kind `30402`)

Purchasable goods are NIP-99 classified listings with the standard tag set
(`title`, `summary`, `image`, `price`, `status`, `t`). Extension:
`["max_uses", "<n>"]` — uses per award; absent defaults to one for listings.
A ticket is a `30402` listing with an `a` tag pointing at its `31923` calendar
event. Admission to a free event needs no listing: the award references the
event address directly.

### Fulfillment (kind `37237`)

Addressable status of one use of one award. Statuses:

```typescript
type BadgeStatus = 'pending' | 'accepted' | 'processing' | 'ready' | 'fulfilled' | 'cancelled';
```

Publish only the states the workflow needs: check-in goes directly to
`fulfilled`; a kitchen may walk the full chain; `cancelled` means fulfillment
will not complete. Do not add refund, packing, or offline-redemption states.

```json
{
	"kind": 37237,
	"tags": [
		["status", "<badge-status>"],
		["a", "<definition-address>"],
		["e", "<kind-8-award-event-id>"],
		["p", "<holder-pubkey>"],
		["event", "<event-coordinate>"],
		["d", "event:<event-coordinate>"]
	]
}
```

The `d` tag is the fulfillment context (`order:<order-id>` or
`event:<event-coordinate>`), with a matching `order`/`event` tag. Current
status per (award, context) = latest valid event by `created_at`, then lowest
event ID as tie-breaker. Signers must be anchor admins, the `badge_issuer`,
or holders of `["permission", "37237", "write"]`. No `type` or `uses` tags.

### Derived state

- One fulfillment whose latest status is `fulfilled` equals one use.
- `remaining uses = max_uses - fulfilled count`.
- Definitions without `max_uses` are unlimited, except `30402` listings
  (default one). New consumable definitions publish `max_uses` explicitly.
- Outstanding = has remaining uses; exhausted = fulfilled count reaches
  `max_uses`; expiration and revocation make an award unusable independently.

UI language may adapt statuses to the product: `fulfilled` = "Checked in"
(gym/event), "Served" (drink/food), "Collected" (merchandise).

### Issuance and enforcement (deployment, not protocol)

- The companion HTTP service (`/invites`, `/redeem`, optional
  `/community/info` mirror) is issuance logistics only — it holds the
  `badge_issuer` key and is never a source of truth. Awards carry `i` tags so
  redemption limits and payment idempotency are rebuilt from relay events
  after restart.
- Write gating is optional and belongs in an external write-policy plugin
  (strfry `writePolicy.plugin`), never in relay code. It derives its award
  cache from the relay itself, fails closed until EOSE, and honors NIP-09
  revocations as events.
