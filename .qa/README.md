# QA harness: orders dashboard end-to-end

Manual/e2e testing setup for the admin orders dashboard
(`src/routes/admin/orders/+page.svelte`). Everything is local; no external
accounts needed.

## Components

- **QA relay**: strfry at `ws://127.0.0.1:18082` ("QA Test Community", CORS `*`).
  Its NIP-11 pubkey is the QA `admin` key from `/tmp/qa-keys.json`. A write
  plugin ("badge-gate") rejects backdated kind 27237 events and treats them as
  **ephemeral**: they are broadcast live to subscribers but never persisted.
  Seed products/awards (kinds 30009/8/30078, persisted normally); never seed
  status history.
- **Keys**: `/tmp/qa-keys.json` — `admin` (community admin), `member1`,
  `member2`. Login at `/login` with `keys.admin.nsec`; the app persists the
  session in localStorage, so Playwright runs stay logged in. The admin kind 0
  must exist on a default relay (`qa-orders-seed.mjs` publishes it) because the
  login flow waits for a kind 0.
- **Dev server**: from this worktree,
  `npm run dev -- --port 5190 --strictPort`. Ports 5173–5178 belong to other
  checkouts. Set `VITE_NIPWORKER_LOG_LEVEL=debug` to surface nipworker's
  Rust-worker tracing in the browser console (wired in `src/hooks.client.ts`).

## E2E test (Playwright)

Playwright is not a project dependency; it lives in the npx cache:

```sh
PLAYWRIGHT_PKG=/root/.npm/_npx/30db2ee5b1e43cfb/node_modules \
  node .qa/qa-orders-e2e.mjs
```

The script is **self-seeding and deterministic**: each run publishes a fresh
kind 30009 product (`qa-ramen-<run>`) and two kind 8 order awards, then:
login → open `/admin/orders` → seeded orders render in New → publish a third
award mid-session and assert it appears live without reload → click Accept on
order-1 and assert it moves to Accepted → assert the relay broadcast the kind
27237 status (listened live from Node, since the QA relay won't persist it).
Final screenshot: `/tmp/orders-final.png`.

Chromium is launched with timer-throttling disabled
(`--disable-background-timer-throttling` etc.); nipworker's live-event path
rides short sweeper timers inside workers and headless throttling can stall
them.

> **Dependency note**: kind 27237 only reaches the app with a patched
> nipworker parser (unknown kinds pass through as generic ParsedEvents instead
> of erroring — `_ => (None, None)` in `crates/core/src/parser/mod.rs` of the
> nipworker repo). Until a nipworker release ships it, this worktree's
> `node_modules/@candypoets/nipworker/dist/parser/index.js` carries a locally
> rebuilt WASM with the patch; reinstalling node_modules drops it.

## Other scripts

- `.qa/qa-orders-seed.mjs` — one-shot seeder for a fixed "QA Ramen" product
  and two orders (the e2e no longer depends on it; useful for manual browsing).
- `.qa/qa-orders-accept.mjs` — older focused Accept-flow test (superseded by
  the e2e).
- `.qa/qa-ws-sniff.mjs` — debug tool: wraps `WebSocket` in the page and logs
  raw relay frames, used to trace live EVENT delivery.
- `.qa/qa-seed.mjs`, `.qa/qa-seed2.mjs`, `.qa/qa-query.mjs` — older generic
  seed/query helpers.
