# PRD: Community-owned badge payments

## Introduction

Provision an independent payment and badge-fulfillment service with every Nuts community relay. A community administrator can connect a supported fiat payment provider, assign a price to a NIP-58 badge, and sell that badge from the community or event interface. After the provider confirms payment through that community's webhook, the community infrastructure signs and publishes a valid badge award to the buyer's Nostr pubkey.

The trust boundary is the community deployment. Nuts supplies the software and provisioning automation, but Nuts does not receive a global payment webhook, hold community payment credentials, sign community badges, or own community transaction records.

The model is analogous to Shopify commerce:

| Commerce concept | Nuts community concept |
| --- | --- |
| Shop | Community relay deployment |
| Product | Badge definition |
| Product price | Badge sale configuration |
| Customer | Nostr pubkey |
| Order | Pending badge purchase |
| Paid-order webhook | Confirmed provider payment |
| Fulfillment | NIP-58 kind `8` badge award |

## Goals

- Provision a community-scoped webhook receiver and badge fulfillment worker alongside every relay.
- Let the community administrator connect and own a supported payment-provider account.
- Let an administrator attach a fiat price and validity policy to a badge definition.
- Bind every checkout to a signed Nostr purchase request and a specific recipient pubkey.
- Automatically issue a badge only after the community service verifies a successful payment.
- Support one-time event badges and renewable membership badges through the same fulfillment pipeline.
- Keep provider-specific behavior behind a stable internal adapter interface.
- Make webhook retries and relay publication failures safe and recoverable.

## Architecture and ownership

Each community deployment contains:

```text
community.example
├── wss://relay.community.example
├── https://community.example/pay
├── https://community.example/hooks/payments/{provider}
├── admin UI
├── payment service
├── fulfillment worker and durable queue
├── community transaction database
└── community badge issuer/signing service
```

Every deployment owns and isolates:

- Payment-provider account and connection credentials
- Provider webhook subscription and signing secret
- Purchases and fulfillment records
- Community badge issuer key
- Published badge awards
- Refund, dispute and revocation state

The badge issuer private key must be held in platform-appropriate protected storage such as KMS, HSM, an encrypted secrets service, or an isolated signing process. It must never be exposed to the browser, stored in relay events, or logged.

## Core flows

### Community provisioning

1. Provision the community relay and public HTTPS origin.
2. Provision the payment API, provider webhook routes, queue, worker and database.
3. Generate or import the community badge issuer key in protected storage.
4. Leave payment providers disabled until an administrator connects one.
5. Display the webhook URL and provider connection state in community administration.

Example community endpoint:

```text
https://community.example/hooks/payments/stripe
```

### Provider connection

1. The administrator selects a supported payment provider.
2. The community payment service starts that provider's OAuth or hosted onboarding flow.
3. The provider account is connected directly to the community deployment.
4. The community service registers its own webhook endpoint when the provider API supports programmatic registration.
5. The webhook signing secret is stored inside the community deployment.
6. The admin UI shows whether onboarding, payment acceptance and payouts are enabled.

### Badge sale configuration

An administrator selects an existing community-issued NIP-58 badge definition and configures:

- Sale enabled or disabled
- Price in minor currency units
- ISO currency code
- One-time or recurring purchase
- Award validity duration
- Provider product/price identifier when required
- Purchase title and description

An event may create a dedicated one-time badge and attach its sale configuration. An event may grant admission to that event badge, an existing membership badge, or either badge.

### Event admission configuration

Event creation must include an **Admission** section. Admission answers two independent questions:

1. Which existing community badges or roles grant free entry?
2. Can a person without one of those credentials buy entrance?

Roles and badges use the same NIP-58 badge-definition coordinates for access checks. The administrator selects definitions rather than individual members.

```text
Admission

Free entry
○ Everyone
● Selected badges or roles

  Member
  Coach
  [+ Add badge or role]

Paid entrance
[✓] Let other people buy entrance

Price: €15
Event badge: Summer meetup entrance
```

The resulting access rule is deliberately small:

```text
may_attend = event_is_open
          OR owns_any_selected_free_badge
          OR owns_event_entrance_badge
```

The supported configurations are:

| Free-entry setting | Paid entrance | Result |
| --- | --- | --- |
| Everyone | Off | Open, free event |
| Selected badges | Off | Closed event; only selected badge/role holders may attend |
| No selected badges | On | Public paid event; entrance badge required |
| Selected badges | On | Selected badge/role holders enter free; everyone else can buy the event badge |

Selecting **Everyone** disables paid entrance because charging is unnecessary when everyone already has free access. Enabling paid entrance with no free-entry badges creates a paid-only event.

The event badge has a one-to-one relationship with its event by default. It is created as part of event setup, uses a stable identifier derived from the event identifier, and is issued after a confirmed one-time payment. The event continues to reference the exact badge-definition coordinate after either the event or badge definition is updated.

Admission affects the ability to confirm attendance, not event discoverability. Public event details and the ability to mark **Interested** may remain visible without an admission badge. A confirmed/going RSVP requires the viewer to satisfy the event access rule.

### Badge purchase

1. The buyer authenticates with a Nostr pubkey.
2. The client requests a server-generated purchase challenge.
3. The buyer signs a purchase authorization containing the community, badge coordinate, recipient pubkey, expected price, currency, expiry and nonce.
4. The community service verifies the signature and creates an immutable pending purchase.
5. The service creates a provider checkout using an internal purchase ID.
6. The buyer completes payment on the provider-hosted or embedded checkout.
7. The success redirect shows only a pending/processing state until server-side confirmation arrives.

The success redirect must never issue a badge or be treated as proof of payment.

### Payment confirmation and fulfillment

```text
Provider webhook
      ↓
Verify signature and payment status
      ↓
Resolve immutable purchase record
      ↓
Verify merchant, amount, currency and badge
      ↓
Persist confirmed payment and enqueue fulfillment
      ↓
Return successful HTTP response
      ↓
Worker signs kind 8 award and publishes to community relay
```

The webhook handler must acknowledge valid deliveries quickly. Badge signing and relay publication happen asynchronously in the worker.

### Recurring membership renewal

1. The provider collects a scheduled renewal payment.
2. A successful-payment webhook resolves the existing community, badge and recipient mapping.
3. The worker issues a new award for the same badge definition with a later expiration.
4. A failed or unpaid renewal issues no award.
5. Cancelling a subscription stops future awards but does not invalidate an already-paid period.

## User stories

### US-001: Provision community payment infrastructure

**Description:** As an infrastructure operator, I want every community relay deployment to include an isolated payment and fulfillment service so that communities can sell badges without depending on a Nuts-owned webhook.

**Acceptance Criteria:**

- [ ] Provisioning creates provider webhook routes under the community origin.
- [ ] Provisioning creates a durable purchase store and fulfillment queue.
- [ ] Provisioning creates or imports a protected community issuer key.
- [ ] No secret or transaction data is shared between community deployments.
- [ ] A health check reports relay, webhook, queue and signer readiness.
- [ ] Deployment and integration tests pass.

### US-002: Connect a payment provider

**Description:** As a community administrator, I want to connect my own payment-provider account so that proceeds are paid to my community.

**Acceptance Criteria:**

- [ ] Admin can start and complete provider onboarding from community settings.
- [ ] Provider credentials are stored only in the community deployment.
- [ ] The community webhook is registered or clear manual registration instructions are shown.
- [ ] Admin sees onboarding, payment and payout capability states.
- [ ] Disconnecting a provider prevents new checkouts without deleting transaction history.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the available browser testing skill.

### US-003: Configure a badge for sale

**Description:** As a community administrator, I want to price a badge so that members can purchase the credential directly.

**Acceptance Criteria:**

- [ ] Admin can select a badge definition issued by the community.
- [ ] Admin can set amount, currency, purchase type and award validity.
- [ ] Invalid or zero prices cannot be published as paid badges.
- [ ] A provider product or price is created or linked where required.
- [ ] Public purchase configuration exposes no provider secrets.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the available browser testing skill.

### US-004: Create a signed badge purchase

**Description:** As a buyer, I want my checkout bound to my Nostr pubkey so that successful payment awards the badge to me.

**Acceptance Criteria:**

- [ ] Server issues a single-use, expiring purchase challenge.
- [ ] Buyer signs the exact community, badge, recipient, amount, currency and nonce.
- [ ] Server rejects changed, expired, replayed or invalid authorizations.
- [ ] Checkout metadata contains only an opaque internal purchase ID.
- [ ] Purchase amount and badge configuration are resolved server-side.
- [ ] Integration tests cover tampering and replay attempts.

### US-005: Fulfill a confirmed one-time payment

**Description:** As a buyer, I want a successful event or membership payment to produce a valid badge award.

**Acceptance Criteria:**

- [ ] Webhook signature is verified using the community's provider secret.
- [ ] Provider API status is checked when required by the provider.
- [ ] Merchant account, amount, currency and purchase ID must match.
- [ ] A successful payment produces exactly one fulfillment record.
- [ ] Worker signs a valid NIP-58 kind `8` award referencing the configured kind `30009` badge and recipient pubkey.
- [ ] Award is published to the community relay and its event ID is stored.
- [ ] A client redirect or unverified webhook cannot issue a badge.
- [ ] Integration tests cover successful, failed and asynchronous payments.

### US-006: Fulfill recurring renewals

**Description:** As a member, I want each successful subscription renewal to extend my membership badge.

**Acceptance Criteria:**

- [ ] Only a confirmed paid renewal enqueues fulfillment.
- [ ] Renewal maps to the original community, badge and recipient.
- [ ] The new award expires after the newly paid service period.
- [ ] Failed, processing, void or unpaid renewals do not issue awards.
- [ ] Cancelling prevents future renewals without shortening the current paid period.
- [ ] Integration tests cover renewals, failure and cancellation.

### US-007: Recover failed fulfillment

**Description:** As a community administrator, I want failed badge publication to retry safely so that a temporary relay outage does not lose a purchase.

**Acceptance Criteria:**

- [ ] Valid payment webhooks are persisted before acknowledgment.
- [ ] Relay failures retry with bounded exponential backoff.
- [ ] A deterministic fulfillment key prevents duplicate badge awards.
- [ ] Admin can inspect pending and failed fulfillment records.
- [ ] Admin can retry a permanently failed fulfillment.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the available browser testing skill.

### US-008: Configure event admission

**Description:** As a community administrator, I want to choose which badge or role holders enter an event for free and optionally sell entrance to everyone else.

**Acceptance Criteria:**

- [ ] Event creation includes an Admission section.
- [ ] Admin can make the event free for everyone.
- [ ] Admin can select one or more community badge definitions that grant free entry.
- [ ] Multiple selected definitions use OR semantics: owning any one grants free entry.
- [ ] Admin can enable paid entrance and set an amount and currency.
- [ ] Enabling paid entrance creates or links a badge dedicated to that event.
- [ ] With selected free-entry badges and paid entrance, either credential grants admission.
- [ ] With no free-entry badges and paid entrance, only the event entrance badge grants admission.
- [ ] Selecting free entry for everyone disables paid entrance and clears contradictory paid settings after confirmation.
- [ ] Published event data references exact badge-definition coordinates, including issuer pubkeys.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the available browser testing skill.

### US-009: Evaluate event eligibility

**Description:** As a viewer, I want the event page to tell me whether I can attend or must buy entrance.

**Acceptance Criteria:**

- [ ] Open events show that the viewer may attend without a badge.
- [ ] A viewer owning any selected free-entry badge is eligible without payment.
- [ ] A viewer owning the event entrance badge is eligible.
- [ ] An ineligible viewer sees the entrance price and purchase action when paid entrance is enabled.
- [ ] An ineligible viewer sees the required badges and no purchase action for a closed unpaid event.
- [ ] Interested RSVP remains available without eligibility.
- [ ] Going/accepted RSVP requires eligibility.
- [ ] Badge checks validate the exact definition coordinate and trusted issuer.
- [ ] Loading and relay-error states do not incorrectly report the viewer as ineligible.
- [ ] Typecheck and lint pass.
- [ ] Verify in browser using the available browser testing skill.

## Functional requirements

- **FR-1:** Each community deployment must expose its own provider webhook URL.
- **FR-2:** Each community must use an isolated webhook signing secret per provider.
- **FR-3:** The system must support provider adapters without changing badge fulfillment logic.
- **FR-4:** The first supported adapter must implement onboarding, checkout creation, webhook verification, payment retrieval and refunds or refund observation.
- **FR-5:** A purchase must be created from a valid Nostr-signed authorization.
- **FR-6:** The server must determine the payable amount from stored badge configuration, not client input.
- **FR-7:** Provider checkout metadata must reference an opaque immutable purchase ID.
- **FR-8:** Badge fulfillment must require a provider-confirmed successful payment.
- **FR-9:** Asynchronous payment methods must remain pending until the provider confirms settlement.
- **FR-10:** Every provider event and payment fulfillment must be idempotent.
- **FR-11:** Webhook processing must not depend on provider event ordering.
- **FR-12:** Badge signing and relay publication must occur outside the webhook request.
- **FR-13:** One-time fulfillment must publish a NIP-58 kind `8` award containing the badge-definition `a` tag and recipient `p` tag.
- **FR-14:** Time-limited awards must include the configured expiration policy.
- **FR-15:** The service must retain payment-to-award audit records without publishing private payment data to Nostr.
- **FR-16:** The admin must be able to see connected-provider and fulfillment health.
- **FR-17:** Provider disconnection must disable new checkout creation.
- **FR-18:** A successful payment must remain fulfillable during a temporary relay outage.
- **FR-19:** An event must support open free admission, badge-restricted admission, paid admission, and badge-free-or-paid admission.
- **FR-20:** Existing badges and roles selected for free entry must use OR semantics.
- **FR-21:** Paid event entrance must use a badge definition dedicated to that event by default.
- **FR-22:** The event must reference every accepted badge by its exact kind `30009` coordinate and issuer.
- **FR-23:** A viewer may submit an accepted/going RSVP only when the event is open or the viewer owns a valid accepted badge.
- **FR-24:** A viewer may submit a tentative/interested RSVP without satisfying event admission.
- **FR-25:** Selecting free admission for everyone and enabling paid entrance must not be representable as an active published configuration.

## Provider adapter

The fulfillment worker consumes normalized events and must not contain provider-specific branches.

```ts
interface CommunityPaymentProvider {
	connect(input: ProviderConnectionInput): Promise<ProviderConnection>;
	createCheckout(purchase: StoredBadgePurchase): Promise<HostedCheckout>;
	verifyWebhook(request: Request): Promise<NormalizedProviderEvent[]>;
	getPayment(providerPaymentId: string): Promise<VerifiedPayment>;
	refundPayment(providerPaymentId: string, amount?: number): Promise<RefundResult>;
}

type NormalizedPaymentSucceeded = {
	type: 'payment.succeeded';
	provider: string;
	providerEventId: string;
	providerPaymentId: string;
	purchaseId: string;
	merchantAccountId: string;
	amount: number;
	currency: string;
};
```

Initial providers to evaluate:

- Stripe Connect
- Mollie Connect
- PayPal Multiparty Checkout
- GoCardless Partner for recurring bank payments

Provider support may vary by deployment region. A community enables only providers for which it has completed onboarding.

## Data model

### Provider connection

```text
provider
merchant_account_id
encrypted_credentials_reference
webhook_subscription_id
encrypted_webhook_secret_reference
onboarding_status
payment_capability_status
payout_capability_status
created_at
updated_at
```

### Badge sale

```text
badge_address
provider
provider_product_id
provider_price_id
amount_minor
currency
purchase_type: one_time | recurring
validity_seconds
enabled
created_at
updated_at
```

### Purchase

```text
purchase_id
badge_address
recipient_pubkey
signed_authorization_event_id
amount_minor
currency
provider
provider_checkout_id
provider_payment_id
status: pending | processing | paid | failed | refunded | disputed
created_at
updated_at
```

### Fulfillment

```text
fulfillment_key
purchase_id
provider_event_id
status: queued | signing | publishing | fulfilled | failed | revoked
attempt_count
badge_award_event_id
last_error
created_at
updated_at
```

Unique constraints are required for provider event ID, provider payment ID where appropriate, purchase fulfillment, and badge award event ID.

## Security and privacy requirements

- Verify webhook signatures against the raw request body before parsing or mutating state.
- Retrieve authoritative payment details from the provider when webhook payloads are insufficient.
- Never trust amount, currency, badge coordinate, merchant account or recipient values supplied only by the client.
- Use single-use nonces and short expiration windows for signed purchase authorizations.
- Redact credentials, webhook payload secrets, payment instrument details and issuer keys from logs.
- Do not publish customer email, legal identity, provider IDs, invoice details or payment metadata in badge events.
- Rate-limit checkout creation and webhook routes independently.
- Record administrative changes to provider connections and badge sale configuration.
- Run the signer with the minimum capability required to sign community badge awards.

## Refunds, disputes and revocation

NIP-58 badge awards are immutable. Therefore:

- Cancellation stops future recurring awards but does not invalidate a paid period.
- A failed renewal produces no new award.
- Refund and chargeback handling requires a community-recognized revocation record or denial list.
- Access checks must consider expiration and any supported revocation record, not only the existence of a kind `8` event.

The exact interoperable revocation event format remains an open protocol decision. Until it is defined, the community service must retain local revocation state and the UI must identify this as community-enforced behavior.

## Admin experience

Keep the existing admin information architecture. Add focused configuration where it belongs:

- Community main page: configure and sell the reusable Member badge.
- Event creation: optionally create a one-to-one event badge, set its price, and permit the event badge and/or Member badge.
- Event detail modal: show event details and RSVP participants.
- Community settings: connect provider and inspect webhook/fulfillment health.

Do not add a general CRM, sales pipeline, accounting suite or separate ticketing subsystem for this scope.

## Non-goals

- Nuts acting as the universal merchant of record.
- A global Nuts payment webhook or transaction database.
- Nuts custodying community proceeds.
- Publishing private payment information to public relays.
- Building a general shopping cart or multi-community checkout.
- Supporting transfers or resale of badges.
- Replacing provider KYC, tax, invoice, dispute or payout systems.
- Treating a checkout success redirect as payment confirmation.
- Automatically issuing badges for untracked manual IBAN or static payment-link transfers.
- Building broad CRM, newsletter or financial-reporting features.

## Reliability requirements

- Webhook receipt must be durably stored before returning success when the provider permits that processing model.
- Duplicate webhook delivery must not produce duplicate fulfillment.
- Out-of-order provider events must converge on authoritative provider payment state.
- Queue retries must use bounded exponential backoff and a dead-letter state.
- A paid purchase must remain recoverable after process restart or relay outage.
- Operators must be able to reconcile provider payments against purchases and badge awards.

## Success metrics

- A confirmed payment produces a published badge without administrator intervention.
- Duplicate webhook deliveries produce exactly one fulfillment.
- No badge is issued for failed, cancelled, unverified or merely processing payments.
- A temporary relay outage does not lose a confirmed purchase.
- Community payment credentials and issuer keys remain isolated between deployments.
- An administrator can connect a provider and publish a priced badge without editing deployment files manually.

## Open questions

1. Which provider adapter should ship first for the initial deployment region: Stripe Connect or Mollie Connect?
2. Will every deployment provide its own KMS/HSM, or should the installer support an encrypted local signer for small self-hosted communities?
3. Which Nostr event or convention will represent badge revocation after a refund or chargeback?
4. Should badge sale configuration live only in the community database, in an application-specific Nostr event, or in both?
5. Should provider onboarding be fully embedded in the admin UI or redirect to provider-hosted onboarding?
6. Which party is the merchant of record under each supported provider configuration?
7. Is manual payment fulfillment permitted as an explicit administrator action, and if so, how is it audited?
