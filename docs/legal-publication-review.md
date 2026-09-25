# Public legal pages: evidence and publication blockers

Status: draft pages implemented; final publication blocked on factual review. No policy text has been finalized or published by this task.

## Source material

The iOS agent's handoff was fetched from `origin/codex/app-store-legal-drafts` and read in full, including `HANDOFF.md`, `REVIEW.md`, `privacy.html`, `terms.html`, and `support.html`. Original files are preserved under `docs/app-store/legal-drafts/`.

The Mac path was unavailable initially; that access blocker is now resolved. The original drafts are the starting content. They are not evidence of the deployed website, backend or released iOS behavior. The implementation adapts their sections while retaining draft status and explicitly separating native descriptions from verified web behavior.

## Confirmed operator inputs

- Operator: **DUCHENE SARL**.
- Support, privacy, and abuse contact: **thib.duchene@gmail.com**.
- The owner subsequently confirmed this mailbox is monitored. No response-time commitment was supplied.
- Address supplied by the owner: **7 route de Mamer, Holzem**. No postcode, country, registration number or jurisdiction has been added by inference.

## Website and backend evidence

These findings describe the checked-out source and installed dependencies. They are not an audit of production configuration or the iOS binary.

| Area                                  | Evidence                                                                                                                                                                                                                                                      | Content implications                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public Nostr data                     | `src/editor/utils.ts`, `src/routes/modals/post.svelte`, `src/controller/nostr.ts`, `src/lib/env.ts`                                                                                                                                                           | Public posts and profile/event metadata are published to relays. Explain public keys, event identifiers, timestamps, tags, redistribution, independent relay policies, and persistence outside the operator's control. Do not imply pseudonymous data is anonymous.                                                                                  |
| Encrypted messages                    | `src/routes/_kinds/kind4.svelte` submits kind-4 messages through nipworker. The adjacent nipworker checkout identifies as `v0.99.16`, matching the installed package; `crates/core/src/parser/kind4.rs` encrypts outgoing content with NIP-04 before signing. | Scope this behavior to web. Encryption of message content does not hide the kind-4 sender/recipient tags or timestamps. Do not describe this as metadata-free or assume the iOS implementation uses the same format.                                                                                                                                 |
| Media hosting                         | `src/lib/upload.ts`: default `https://blossom.nuts.cash`; user-configured Blossom/NIP-96 servers are supported. `src/editor/index.ts` sets `immediateUpload: true`.                                                                                           | Uploads can happen as soon as media is added, before a post is published. Removing an attachment from the composer or deleting a post does not establish deletion at the host. No attachment-encryption guarantee was verified. A hostname alone does not establish the provider's legal identity, storage location, or retention policy.            |
| Browser wallet storage                | `src/controller/proofs.ts`, `src/model/cashu/tx-recovery.ts`, `src/model/cashu/proof-backup.ts`                                                                                                                                                               | Proofs and recovery state use localStorage/IndexedDB; kind-7375 backups are published to relays. The matching nipworker source in `crates/core/src/parser/kind7375.rs` encrypts backup content with NIP-44. Do not claim all wallet information stays exclusively on the device. Clearing browser data can remove locally held recovery information. |
| Lightning-address backend             | `src/hooks.server.ts` initializes `@candypoets/lnuts`; installed `dist/db/schema.js` defines claims and payments tables.                                                                                                                                      | Claims include alias, public key, mint/relay configuration, and timestamps. Payment rows include invoices, amounts, statuses, recipient/locking keys, quote/payment identifiers, zap data, token delivery data, and timestamps. Do not claim the backend stores no financial information or no tokens.                                               |
| Payment-record deletion               | Installed lnuts schema includes claim tombstones and removes the payments-to-claims foreign key.                                                                                                                                                              | Removing an address claim is not evidence that related payment history is erased. Verify the deployed retention/deletion process separately.                                                                                                                                                                                                         |
| Web notifications                     | No `PushManager`, push registration, APNs integration, or `Notification.requestPermission` use found in the web source searched. In-app notification toasts exist.                                                                                            | Distinguish in-app notifications from background push. This does not establish that a separate production push service or native app does not exist. iOS device tokens, push payloads, providers, consent, disabling, and retention remain unverified.                                                                                               |
| Preview services and network requests | `src/routes/api/link-preview/+server.ts`, `src/lib/server/postPreview.ts`, `server.ts`, `src/app.html`                                                                                                                                                        | Link previews fetch remote content; post previews query relays; a relay-proxy endpoint is available; the app template requests Google Fonts. Do not promise no third-party connections or infer production access-log practices from app code.                                                                                                       |
| User deletion/reporting               | No general account-deletion or abuse-report UI was established by the inspected web source. Kind-5 community award revocation is a separate administrative feature.                                                                                           | Do not tell web users to use an unverified Delete Account or Report menu. Email can be the explicitly supplied contact channel, but do not invent handling deadlines or complete erasure guarantees.                                                                                                                                                 |

Protocol cross-checks:

- [NIP-09 deletion requests](https://github.com/nostr-protocol/nips/blob/master/09.md): requests cannot guarantee deletion from all relays and clients.
- [NIP-04 encrypted messages](https://github.com/nostr-protocol/nips/blob/master/04.md): encrypted content is accompanied by public event metadata.

## Current confirmations and remaining facts

Confirmed directly by the owner:

- DUCHENE SARL operates `blossom.nuts.cash` and can remove hosted files on request.
- No service logs are retained and no operator server backups are maintained. This does not describe device-local wallet recovery state or encrypted wallet backups on independent Nostr relays.
- All support/privacy/abuse emails are kept, including resolved requests.
- Nuts is a crypto wallet; the owner says they do not operate the payment service. The public wording now distinguishes the wallet from selected mints, Lightning-address services and checkout providers rather than attributing their records to DUCHENE SARL.
- The contact is monitored; operator name and postal address were supplied.

Remaining factual checks:

1. **Embedded Lightning-address service deployment.** `src/hooks.server.ts` unconditionally constructs `LnutsHandler` and routes requests through it. That dependency initializes a database and exposes claim/payment endpoints. Separately, `src/lib/paymentService.ts` points community checkout to `payments.nuts.cash`. These are distinct code paths. Confirm whether the deployed website differs from this checkout or whether its embedded Lightning-address endpoints are unused/disabled. The owner’s statement resolves intended responsibility but does not establish which backend code actually runs. Do not state that DUCHENE SARL operates all payment providers or that the deployed application cannot store any payment-related records.
2. **Media expiry.** Request-based removal is confirmed; whether files also expire automatically has not been supplied. Do not invent an expiry period.
3. **Native push and deletion.** iOS-specific descriptions are supplied by the iOS agent, but actual push-service storage/cleanup and the released Delete account procedure have not been independently verified here. Keep native behavior separate from web behavior.
4. **Operator infrastructure.** Media-host operator identity is now known. Infrastructure provider/processing location and native push arrangements are not established by comparing policies of other clients. Do not name unverified vendors or transfer mechanisms.

Original source drafts and REVIEW.md remain preserved. The entries below describe earlier findings and confirmations chronologically; the current status above supersedes earlier unanswered retention questions.

## Implementation

- Stable URLs: `https://nuts.cash/legal/privacy`, `https://nuts.cash/legal/terms`, `https://nuts.cash/legal/support`.
- Use complete server-served HTML documents for these routes. The main app sets `ssr = false` in `src/routes/+layout.ts`; simply adding ordinary pages would leave content dependent on browser JavaScript. Legal pages should work on a direct request and refresh without login, wallet initialization, relay connections, or JavaScript.
- Match the landing design: cream `#f2ebdd`, dark green `#15372c`, mustard `#e7b638`, the existing Nuts logo, and locally hosted Suisse font. Use readable body text, a restrained content width, responsive navigation, visible focus, and mobile-safe wrapping.
- Add discoverable links to the landing footer and an existing app navigation surface, plus navigation between all legal pages. For standalone HTML routes, use full-document navigation from the app.
- Use functional email links with encoded subjects: `Nuts support`, `Nuts privacy request`, and `Nuts abuse report`. Display the address for users without a configured mail client. Never request private keys, seed phrases, or unspent tokens in support email.
- Preserve draft labels until review blockers are resolved. Do not pass draft URLs to App Store configuration as final published policy.

## Deployment and verification

The repository's existing workflow is `.github/workflows/docker-build.yml`:

- A push to `main` builds multi-architecture images and publishes `docker.nuts.cash/nuts:latest`, a package-version tag, and a commit tag.
- Pull requests build without pushing an image; `dev` builds the development image.
- The workflow does **not** contain a command that updates the running production container. Its success proves image publication, not that nuts.cash is serving that image. Identify the deployment mechanism if the site does not update automatically.
- Do not include unrelated dirty files in the release commit. There is extensive pre-existing workspace work, including page titles and event-link fixes.

Before release, validate production build, route HTTP status/content type, complete HTML with JavaScript disabled, mobile and desktop layout, refresh, internal navigation, titles/canonical URLs, email subjects, and accessibility basics. Then verify the exact live pages after deployment, not just the image-build result.

Live checks during this task returned **404 for all three URLs**. The routes are implemented locally with draft labels and noindex; they have not been deployed. The current successful image-build run for commit `300388e` predates this task and contains none of these pages.

## Adaptations from the supplied drafts

- Retained the original privacy, terms and support structure and the owner-supplied operator/contact.
- Corrected the website messaging description to NIP-04, with visible event metadata; did not import iOS Keychain claims into the browser description.
- Added immediate media upload behavior and separate host deletion limitations.
- Added the Lightning-address backend payment/claim records omitted from the native draft.
- Distinguished in-app web notifications from the native push registration described by the iOS agent.
- Removed unqualified web instructions to use post/profile Report or Profile → Delete account. Native instructions are attributed to the iOS draft and marked as awaiting verification.
- Retained draft banners, noindex metadata/headers and no effective date. Unconfirmed processing grounds and operational practices are flagged rather than presented as finalized promises.
- The contact inbox is described as monitored following the owner’s confirmation. Response-time promises have not been added.

## Files and validation

- `src/routes/legal/[document]/+server.ts`: unauthenticated complete HTML endpoints, unknown-page 404 and legacy `.html` redirects.
- `src/lib/server/legalContent.ts`: adapted document content and explicit pending-review state.
- `src/lib/server/legalPage.ts` and `static/legal.css`: shared accessible layout, local assets, canonical URLs, email subjects and restrictive response headers.
- Landing footer and the active profile menu link to the legal/support pages with full-document navigation.
- `src/lib/server/legalPage.test.ts`: 13 passing tests for complete HTML, contact subjects, navigation, draft markers, route handling and redirects.
- Production build: **passed** in an isolated checkout of `300388e` plus only this task’s changes, using the installed dependency tree. Existing unrelated compiler warnings remain. No unrelated workspace changes were included in that build.
- Browser checks: **passed** against the production Node build at 320px, 390px and 1440px. All three pages returned complete HTML, refreshed with JavaScript disabled, made no external requests and had no horizontal overflow. Cross-page navigation, `.html` redirects, unknown-route 404, skip link and landing-footer navigation passed. Active profile-menu navigation also passed at 390px and 1440px with a generated local test identity and external traffic blocked. Desktop and mobile screenshots were inspected. Legacy DesktopNav/MobileNav components are unused, so no changes to those components are included; the active profile menu carries the in-app links.
- Reproducible browser check: start the production build on port 5297 and run `node .qa/qa-legal-pages.mjs`; use `QA_BASE_URL` for another local server and `QA_SCREENSHOTS` for the output directory. Playwright uses the existing QA helper’s package discovery.
- Full-repository `svelte-check`: **not clean** (366 errors and 260 warnings in 93 unrelated files); no diagnostics in the new legal modules; the existing profile component also retains its pre-existing accessibility warnings. These existing project diagnostics were not expanded into this work.
- Svelte autofixer reports the repository’s custom `resolve()` wrapper as an unrecognized route resolver; links do use `src/lib/paths.ts` and browser navigation passed.

## Subsequent owner replies and comparison research

- Owner: “I don’t keep anything.” This cannot support a blanket no-storage claim: the checked-out Lightning-address service has persistent claim/payment tables and media uploads use a hosting endpoint. Deployment-specific log, record, media and backup handling is still needed to reconcile that statement with the implementation. No deletion job, retention interval or production purge behavior was inferred.
- Owner supplied **DUCHENE SARL, 7 route de Mamer, Holzem**; added as supplied, without inventing a postcode or other legal details.
- Owner asked to look at other Nostr clients. [Amethyst](https://github.com/vitorpamplona/amethyst/blob/main/PRIVACY.md) separates local client data from data sent to independently operated relays/media servers and notes public-network persistence. [Damus](https://github.com/damus-io/damus#privacy) discloses IP and public-key exposure to connected services. Those are useful presentation examples, not evidence of Nuts’ vendors, storage locations or backend deletion behavior. No competing client’s no-server/no-storage claim was copied.
- The earlier iOS question concerned the native draft’s push registration and Delete account cleanup. It was clarified for the owner; the source material remains attributed rather than represented as observed released behavior.

## Latest owner clarification

The owner explicitly confirmed operation and request-based removal at blossom.nuts.cash, no retained logs, no server backups, and retention of all support emails. These facts have been incorporated into privacy and support. Wallet/network backups are distinguished from operator backups. Payment wording now describes independent providers as requested, while the embedded lnuts deployment discrepancy remains an internal factual check rather than an unsupported claim that the owner processes payments. No liability conclusion was inferred from the description “crypto wallet.”
