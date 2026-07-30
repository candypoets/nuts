# QA harness: provisioned-community end-to-end testing

Everything is local; no external accounts needed. The model: **create a real
community through the real flow, run workflow e2e tests against it, then tear
it down.**

```
qa-bootstrap.mjs  →  /tmp/qa-community.json  →  qa-orders-e2e.mjs (etc.)  →  qa-teardown.mjs
```

## Components

- **Coordinator**: `strfry-badge-coordinator` in dev mode at `127.0.0.1:7798`
  (`DEV_DIRECT_PORTS=true`). `POST /relays` provisions a real
  `strfry-badge-relay-node` container on loopback ports; `DELETE /relays/{id}`
  removes it. Start it per `strfry-badge-node/test/app/README.md` (Option A).
- **Keys**: `strfry-badge-node/test/env/keys.json` — the `admin` key is in the
  coordinator's `COORDINATOR_ADMIN_PUBKEYS`, so it can provision relays and is
  the community admin of everything it creates. Override with `KEYS_JSON`.
- **Dev server**: scripts reuse `BASE_URL` (or a server already on `:5191`),
  otherwise spawn `vite dev --port 5191` themselves with
  `VITE_COORDINATOR_URL` pointing at the local coordinator, and kill it on
  exit. Log: `/tmp/qa-devserver.log`.
- **State file**: `/tmp/qa-community.json` (override with `QA_STATE`) — relay
  id, `relay_url`, `base_url`, admin pubkey. Written by bootstrap, read by
  workflow scripts, removed by teardown.
- **Playwright**: resolved from `PLAYWRIGHT_PKG` or auto-discovered in the
  npx cache; not a project dependency. Chromium is launched with
  timer-throttling disabled — nipworker's live-event path rides short sweeper
  timers inside workers and headless throttling can stall them.

## The loop

```sh
node .qa/qa-bootstrap.mjs     # drive /create through the real UI (battle-tests create)
node .qa/qa-orders-e2e.mjs    # workflow e2e against the provisioned relay
node .qa/qa-teardown.mjs      # DELETE relay + docker volume, remove state file
```

Fast variant that skips the UI and provisions via the coordinator API (~2s,
for iterating on a workflow rather than testing create):

```sh
node .qa/qa-bootstrap.mjs --api
```

Archetype variant: `--type <sports|hospitality|club|village|professional|other>`
(default `hospitality`) picks the create-page archetype tile and the
`['type', …]` tag on the kind 30078 community profile, and records `type` in
the state file. Sports communities switch the orders page to the
check-ins/passes view:

```sh
node .qa/qa-bootstrap.mjs --api --type sports
```

Recommended full run order (events + passes both work against sports;
orders/scan need hospitality):

```sh
node .qa/qa-teardown.mjs
node .qa/qa-bootstrap.mjs                      # hospitality
node .qa/qa-orders-e2e.mjs
node .qa/qa-scan-e2e.mjs
node .qa/qa-events-e2e.mjs
node .qa/qa-teardown.mjs
node .qa/qa-bootstrap.mjs --type sports        # sports
node .qa/qa-passes-e2e.mjs                     # needs sports
node .qa/qa-events-e2e.mjs                     # archetype-independent
```

After a crashed run (state file gone, container leaked):

```sh
node .qa/qa-teardown.mjs --sweep   # deletes all qa-* relays + orphan strfry volumes
```

Note: the coordinator's `DELETE /relays/{id}` removes the container and DB
record but **not** the named volume `strfry-badge-data-<id>`; teardown removes
it explicitly.

## Scripts

- `qa-lib.mjs` — shared helpers: key loading (both key-file shapes), NIP-98
  signing (kind 27235, signed at call time — verifiers apply a ~60s staleness
  window), coordinator API client, community state file, dev server
  management, Playwright launch, session seeding.
- `qa-bootstrap.mjs` — creates a "QA Cafe \<run\>" community ("QA Gym \<run\>"
  etc. with `--type`). UI mode injects
  the admin session into `/create`, picks the archetype tile matching `--type`
  (default: Restaurant), fills the
  creator name when the account has no kind-0 (new-signup path), waits for the
  admin dashboard, then resolves the coordinator record and writes the state
  file (including `type`). `--api` mode skips the UI and additionally plants
  the admin kind-0 on the new relay itself (republish-retry, 45s window — a
  freshly "running" relay can still drop the first write under load), since
  the dashboard header/People table resolve names from the community relay only.
  Screenshots: `/tmp/qa-bootstrap.png` (success), `/tmp/qa-bootstrap-failure.png`.
- `qa-invite-redeem-e2e.mjs` — invite create → redeem e2e: admin creates an
  invite through the UI, a cold browser opens the claim URL exactly as
  produced (the invitee's named kind-0 is pre-published to the index relays as
  test setup), redeems, then asserts: `/community/info` advertises the
  externally reachable `relay_url`; the redeemer's NAMED kind-0 lands on the
  community relay (joining publishes the profile); the kind-8 award is signed
  by `badge_issuer_pubkey`; the invite service self-published the
  `30009:<issuer>:members` definition; the People page renders the new member
  BY NAME (not an npub prefix) and counts 2 members.
- `qa-members-modal-e2e.mjs` — People page MemberProfileModal + "Ban member"
  e2e: seeds two members (issuer-signed kind-8 membership awards + named
  kind-0s on the community relay), then exercises everything the modal offers
  (it is read-only: kind-0 name/picture/nip05/about rendering, roles/expiry/
  status, npub, Copy address with clipboard assertion, close via X/Escape/
  backdrop; negative: no ban/assign/message actions inside). The ban flow
  works end to end via kind-5 badge deletion: row menu → Ban member publishes
  an admin-signed kind 5 (`e`=award id, `k`=8, reason as content) — asserted
  on the relay with `nak` — the member's row disappears from the open People
  table LIVE, and a raw-WS write from the banned key is rejected by the gate
  ("blocked: required badge missing"). Note: the issuer-signed kind-8 award
  itself remains in relay storage (strfry NIP-09 deletes only same-author
  events); the ban is enforced by the gate's membership cache and the app's
  deletion filtering, pinned by an assertion. Negative: Ban member is disabled
  on the root admin row.
- `qa-store-e2e.mjs` — store manager e2e: create a product through the UI,
  verify the 30009 event on the relay (type/t/sellable/max_uses/price), edit
  the price (same `d`, newer created_at), archive (leaves the items view,
  shows under Archived). Includes regression assertions that no phantom
  public-storefront pane renders over `/admin/.../store`.
- `qa-wallet-e2e.mjs` — fresh-account wallet e2e: starts an ephemeral Nutshell
  `FakeWallet` mint, creates the wallet through the Home UI, claims a local
  lnuts address, sends an auto-settled signed NIP-57 zap, verifies the kind
  9735 receipt on the relay and in the Home feed, then proves that Home fetched
  and stored the P2PK proofs and published a kind 7375 backup. Requires lnuts
  0.3.1+ and defaults to port 5194. Set `QA_MINT_URL` to reuse another
  auto-settling test mint instead of starting Docker. Screenshots:
  `/tmp/qa-wallet-final.png`, `/tmp/qa-wallet-failure.png`.
- `qa-event-cashu-e2e.mjs` — paid-event Cashu e2e: starts the same ephemeral
  Nutshell `FakeWallet` mint, funds a buyer wallet, pays the event's fixed sats
  price through the real browser checkout, and verifies the signed kind 9321
  plus issuer-signed kind 8 entrance award. It also proves exact-request
  idempotency, durable proof-replay rejection, organizer P2PK receipt, and
  final `SPENT` proof state at the mint. Defaults to port 5196; set
  `QA_MINT_URL` to reuse a test mint. Screenshots:
  `/tmp/event-cashu-final.png`, `/tmp/event-cashu-failure.png`.
- `qa-scan-e2e.mjs` — QR scan/check-in e2e: seeds a QR-fulfillment product +
  award, builds a signed entitlement-presentation QR, then a COLD scanner page
  must accept the FIRST scan attempt (regression for the EOSE races: one EOSE
  per filter, and the old fixed 2500ms window), confirms fulfillment, and the
  order moves to the fulfilled column with the 37237 on the relay.

> **Status kind**: readers, writers, and QA assertions use kind `37237`
> exclusively. It is addressable, with `d` set to the fulfillment context.
- `qa-events-e2e.mjs` — events + ticket check-in e2e: creates an event with a
  paid entrance through the 3-step wizard, asserts the 31923 event and the
  `event_access` 30009 ticket definition on the relay (max_uses=1, `a` event
  coordinate, expiration == event end), seeds RSVP + ticket award, opens the
  scanner with the event check-in context, cold first-attempt check-in →
  37237 `fulfilled` with `['event', <coordinate>]`, and a BYTE-IDENTICAL
  rescan must report "already checked in" via a real relay round-trip
  (regression for the subscription-id dedupe stale-cache bug).
- `qa-roles-e2e.mjs` — roles & delegated-staff e2e: creates a role granting
  `store` through the roles UI (after a deliberate members-page detour —
  cacheFirst-poisoning regression), assigns it to a staff member via the
  People UI, then a staff session must see Store/Orders nav only, publish a
  product as a delegated author (30009 on the relay authored by staff), and
  on kind-5 revocation lose the badge LIVE on the open People page (no
  reload) and get bounced out of the store manager.
- `qa-events-e2e.mjs` — events e2e: creates an event with a paid ticket AND
  capacity 2 through the create wizard, asserts the kind 31923 (incl. the
  `['capacity', '2']` tag) and the 30009 ticket definition on the relay, seeds
  a ticket award plus two accepted kind 31925 RSVPs from fresh random keys
  (each needs an issuer-signed membership award first — the badge gate rejects
  non-member writes; the badge issuer secret comes from the coordinator's
  `/relays/{id}/secrets`), then asserts the list row "Going 2 / 2", the detail
  overlay roster and "0 of 2 places remaining". Finally drives the attendee
  ticket scan (first attempt must reach confirmation; second scan of the same
  ticket reports already checked in — re-signed QR, see the
  byte-identical-rescan dedup note in the script). Archetype-independent.
  Screenshots: `/tmp/events-final.png`, `/tmp/events-failure.png`.
- `qa-passes-e2e.mjs` — sports pass check-in e2e (needs a SPORTS community,
  `qa-bootstrap.mjs --type sports`): seeds a type=pass max_uses=10 catalog
  definition + award, then drives the "Active passes" Check in button on
  `/admin/<relay>/orders` 10 times, waiting for the "N uses left" label to
  actually decrement between clicks (it only updates when the 37237
  round-trips through the live subscription; the button is disabled in
  publishingKeys meanwhile). After the 10th, asserts the pass drops out of
  Active passes, "Today's check-ins" lists 10 cards, the relay holds 10
  distinct fulfilled `checkin-<awardId>-*` contexts, and a Node port of the
  `remainingAwardUses` derivation cross-checks to 0. An 11th scan of the
  entitlement QR (fake camera) must report "This entitlement has no uses
  remaining." Screenshots: `/tmp/passes-final.png`, `/tmp/passes-failure.png`.
- `qa-orders-e2e.mjs` — orders dashboard e2e. Self-seeds a fresh product
  (`qa-ramen-<run>`) and two kind-8 order awards (admin-signed; the stock
  badge-gate accepts any event from a configured admin pubkey), then: seeded
  orders render in New → a third award published mid-session appears live
  without reload → rapid click-through of the full kitchen ladder
  (accept → preparing → ready → served) with a per-step 37237 broadcast
  assertion (same award, same `['order', orderId]` context, admin-signed) and
  a strictly-monotonic `created_at` regression guard (same-second updates
  used to be a reader-side coin flip) → fulfilled order leaves all active
  columns with no further actions → cancel path (order struck through under
  Cancelled, `cancelled` 37237 broadcast). Screenshot: `/tmp/orders-final.png`.
- `qa-teardown.mjs` — see above. `--sweep` only touches `qa-*` domains (and
  volumes whose relay id is gone from the coordinator DB), so it is safe to run
  alongside other checkouts sharing the same coordinator.
- `qa-orders-sniff.mjs` — debug tool: wraps `WebSocket` in the page, logs raw
  37237 frames, publishes a status from Node, and watches the board. Used to
  trace live EVENT delivery.

## Running workflows in parallel

Each workflow script takes its own state file and dev-server port, so several
loops can run concurrently against the shared coordinator:

```sh
QA_STATE=/tmp/qa-community-invite.json QA_DEV_PORT=5192 node .qa/qa-bootstrap.mjs --api
QA_STATE=/tmp/qa-community-invite.json QA_DEV_PORT=5192 node .qa/qa-invite-redeem-e2e.mjs
QA_STATE=/tmp/qa-community-invite.json node .qa/qa-teardown.mjs
```

Two hard rules when sharing the coordinator:

- **Never `--sweep` while another run is live** — it deletes ALL `qa-*`
  relays, including the other run's. Sweep is end-of-session cleanup only.
- The admin key is shared, and the dashboard auto-selects `adminRelays[0]`;
  a parallel run's community can win that race. Scripts pre-plant
  `admin/selectedRelayUrl` in the seeded session and navigate via
  `/admin/<enc(relay)>/...` to pin the right community.

Known flake: a freshly spawned `vite dev` occasionally throws
`Failed to fetch dynamically imported module: .svelte-kit/generated/client/nodes/0.js`
on first load (dev-server module invalidation). It usually self-heals; a page
reload or rerun gets past it.

## Legacy fixed-relay mode

`qa-orders-e2e.mjs` still works against the old fixed QA relay when no
community state file exists (or when `RELAY`/`KEYS_JSON` are set explicitly):

```sh
RELAY=ws://127.0.0.1:18082 KEYS_JSON=/tmp/qa-keys.json node .qa/qa-orders-e2e.mjs
```

The fixed strfry at `ws://127.0.0.1:18082` runs a custom badge-gate.

## Older scripts

- `.qa/qa-orders-seed.mjs` — one-shot seeder for a fixed "QA Ramen" product
  and two orders (the e2e is self-seeding; useful for manual browsing).
- `.qa/qa-orders-accept.mjs` — older focused Accept-flow test (superseded).
- `.qa/qa-ws-sniff.mjs` — debug tool: wraps `WebSocket` in the page and logs
  raw relay frames.
- `.qa/qa-seed.mjs`, `.qa/qa-seed2.mjs`, `.qa/qa-query.mjs` — generic
  seed/query helpers for the fixed relay (members, roles, events, RSVPs).

> **Dependency note**: kind 37237 only reaches the app with a nipworker parser
> that passes unknown kinds through as generic ParsedEvents. That fix shipped
> in `@candypoets/nipworker` **0.97.9** (`fix(parser): preserve unsupported
event kinds`), so a normal `npm install` is sufficient — no local WASM patch
> needed anymore. (If the board ever stops reacting to status updates, check
> the installed version first: `jq -r .version
node_modules/@candypoets/nipworker/package.json`.)
