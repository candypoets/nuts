# PRD: eCash Transaction Recovery (NutsCash)

## Summary
Introduce a durable, resumable transaction system for all eCash transfer flows to ensure **no funds are lost** when the app crashes mid-flight (reloads, tab closes, network failures). The system will **resume automatically on app start** and continue from the last completed step using persisted transaction state. A single relay `OK` ack is considered successful Nostr publish.

This PRD describes functional requirements, data model, state machines, integration points, UX, and code changes.

---

## Goals
- **Recoverability**: Funds are never lost if any step fails mid-flight.
- **Automatic resume**: On app start, any in-flight transaction resumes automatically (no user action required).
- **Idempotent retries**: Steps are safe to repeat and won’t duplicate payments or events.
- **Minimal UI impact**: UI updates reflect recovery status but should not require new manual steps.
- **Compatibility**: Integrate with current wallet logic in `src/controller/proofs.ts`.

---

## Non-Goals
- Implementing new cryptographic primitives.
- Changing business logic for amounts/fees.
- Introducing new storage engines beyond existing IndexedDB + localStorage.

---

## Current Flows
Located in `src/routes/modals/ecash.svelte`:
1. **Nutszap**: send ecash to a Nostr profile.
2. **Nutszap + Melt**: swap mint, then send ecash to Nostr profile.
3. **Zap**: Lightning transfer (ecash melt to pay invoice).

Current risk: mid-flight failures can drop proofs, lose change, or fail publish after melt.

---

## Key Constraints
- A **single relay ack** is considered successful Nostr publish.
- Wallet logic is centralized in `src/controller/proofs.ts`.
- Proof reservation is not currently supported.
- Must persist state across reloads.

---

## Proposed Architecture

### 1) Durable State Machine per Transaction
Each transaction becomes a record with explicit **step** and **artifacts** written to storage before/after every side effect.

**Storage**
- **IndexedDB**: primary store for tx records (proofs, quotes, nostr payload).
- **localStorage**: store `activeTxId` pointer for quick resume.

### 2) Global Resume
On app start (global entry point), automatically:
1. Load `activeTxId` from localStorage.
2. Load tx state from IndexedDB.
3. If `step !== finalize`, call `advanceTransaction()` to continue.

### 3) Proof Reservation
Add “reservation” to prevent double-spend while tx is pending:
- Keep a `reservedProofs` map in `NutsWallet`.
- Move proofs to `reservedProofs` before melt/send.
- On success: move reserved → spent or commit.
- On failure: release reserved → unspent.

---

## Data Model

### Transaction State (persisted)
```
type TxType = "nutszap" | "nutszap-melt" | "zap";

interface TxState {
  txId: string;
  type: TxType;
  createdAt: number;
  updatedAt: number;
  step: string; // named step, e.g. "perform_melt"

  params: {
    amount: number;
    memo?: string;
    pubkey?: string;
    noteId?: string;
    fromMint?: string;
    toMint?: string;
    zap?: boolean;
  };

  proofs: {
    reserved?: Proof[];
    send?: Proof[];
    change?: Proof[];
    minted?: Proof[];
  };

  quotes: {
    meltQuote?: MeltQuote;
    mintQuote?: MintQuote;
  };

  nostr: {
    eventId?: string;
    eventPayload?: NostrEvent;
    relaysTried?: string[];
    publishAckRelay?: string; // first successful ack
  };

  errors?: {
    lastError?: string;
    lastStep?: string;
  };
}
```

---

## State Machines

### Nutszap (ecash → Nostr)
Steps:
1. `reserve_proofs`
2. `build_nutszap_event`
3. `publish_nutszap_event` (success if **any relay** acks)
4. `finalize`

### Nutszap + Melt (mint swap + ecash → Nostr)
Steps:
1. `reserve_proofs`
2. `get_melt_quote`
3. `perform_melt`
4. `get_mint_quote`
5. `perform_mint`
6. `build_nutszap_event`
7. `publish_nutszap_event` (success if any relay acks)
8. `finalize`

### Zap (Lightning)
Steps:
1. `build_zap_request`
2. `fetch_zap_invoice`
3. `get_melt_quote`
4. `perform_melt`
5. `store_change_proofs`
6. `finalize`

---

## Idempotency Rules
- If an output exists for a step, the step should not repeat its irreversible action.
- Nostr publish:
  - If `eventPayload` exists and `publishAckRelay` is set → consider success.
  - If `eventPayload` exists but no ack → re-publish to relays.
- Mint/Melt:
  - If `minted` proofs exist → skip mint.
  - If melt response indicates paid → skip melt.
- Proof storage:
  - `addProofs` is already idempotent (by `secret` uniqueness).

---

## Automatic Resume Strategy

### Trigger
- App startup (global, not modal only).

### Resume Logic
1. Load `activeTxId`.
2. Load `TxState`.
3. If `step !== finalize`, call `advanceTransaction(txId)`.
4. Each step checks if its output is already persisted and skips as needed.

---

## UX Requirements
- When recovery is happening, show “Resuming transaction…” banner.
- Show last step and last error (if any).
- Provide cancel & recover option:
  - Release reserved proofs.
  - Preserve mint/melt artifacts for audit.

---

## Integration Points

### New Module
Create a dedicated recovery module:
```
src/model/cashu/tx-recovery.ts
```

Responsibilities:
- `startTransaction(params)`
- `advanceTransaction(txId)`
- `resumeActiveTransaction()`
- `finalizeTransaction(txId)`
- `abortTransaction(txId)`

### Wallet Changes
In `src/controller/proofs.ts`:
- Add `reservedProofs: Map<string, Proof[]>`.
- Add `reserveProofs`, `releaseReserved`, `commitReserved`.

### Global Resume Hook
Place resume call in a global entry point (ex: `src/routes/+layout.svelte` or controller init).

---

## Detailed Code Changes

### 1) Add Recovery Module
**File:** `src/model/cashu/tx-recovery.ts`

**Key functions:**
- `startTransaction(type, params)`
  - Create `TxState`.
  - Store in IndexedDB.
  - Set localStorage `activeTxId`.
- `advanceTransaction(txId)`
  - Load state.
  - Run next step safely.
  - Persist new state after each step.
- `resumeActiveTransaction()`
  - Load `activeTxId` and call `advanceTransaction`.
- `finalizeTransaction(txId)`
  - Clear `activeTxId`.
  - Mark `step = finalize`.

### 2) Extend Wallet to Reserve Proofs
**File:** `src/controller/proofs.ts`

Add to `NutsWallet`:
- `reservedProofs: Map<string, Proof[]>`
- `reserveProofs(mint, proofs)`
- `releaseReserved(mint, proofs)`
- `commitReserved(mint, proofs)` // move reserved → spent or remove from unspent

**Behavior**
- On `reserveProofs`, remove from `unspentProofs` and move to `reservedProofs`.
- On `releaseReserved`, move back to `unspentProofs`.
- On `commitReserved`, move to `spentProofs`.

### 3) Wire into ecash flow
**File:** `src/routes/modals/ecash.svelte`

- Replace direct flow calls with `startTransaction(...)`.
- Let `tx-recovery.ts` drive steps.
- Subscribe to `TxState` for UI progress.

### 4) Add IndexedDB Store (if not already)
If existing DB utilities exist, add a `txs` table.
Minimum fields: `txId`, `state`.

---

## Detailed Step Implementation (Pseudo)

### reserve_proofs
- Determine proofs to use.
- Persist `proofs.reserved`.
- Call `nutsWallet.reserveProofs(...)`.

### get_melt_quote
- Request melt quote.
- Persist `quotes.meltQuote`.

### perform_melt
- Execute melt with reserved proofs.
- Persist melt response and any change.

### get_mint_quote / perform_mint
- Request mint quote, then mint proofs.
- Persist `proofs.minted`.

### build_nutszap_event
- Build and sign event.
- Persist `nostr.eventPayload`, `nostr.eventId`.

### publish_nutszap_event
- Publish via `usePublish`.
- On **first ack**, persist `nostr.publishAckRelay`.
- If ack exists, consider successful.

### store_change_proofs
- Save change proofs into wallet via `saveProofs`.

### finalize
- Release/commit reserved proofs.
- Clear `activeTxId`.
- Mark transaction complete.

---

## Edge Cases

### Melt succeeded, event publish failed
- Resume: publish event from stored payload.

### Mint succeeded, app crashed before saving proofs
- Resume: save minted proofs into wallet.

### Zap invoice retrieved, melt failed
- Resume: get melt quote again or abort.

### Partial Nostr publish
- A single ack is success. Subsequent publishes can be skipped once ack stored.

---



## Open Questions (Resolved)
- Resume globally? **Yes.**
- Proof reservation supported? **No, to be added.**
- Partial Nostr ack? **One ack is success.**

---

## Milestones

1. **Phase 1**: Add recovery module + storage
2. **Phase 2**: Add proof reservation helpers
3. **Phase 3**: Integrate modal flow
4. **Phase 4**: Add global resume on app start
5. **Phase 5**: Manual testing + polish

---

## Expected Outcome
- All transaction flows become safe and resumable.
- Reloads or failures do not lose money.
- System automatically recovers without requiring manual user action.