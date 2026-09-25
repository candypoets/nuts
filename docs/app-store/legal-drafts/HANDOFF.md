# Website agent handoff

Add public privacy, terms/community rules, and support pages to the existing https://nuts.cash website, matching its design.

The draft content is in this directory: `privacy.html`, `terms.html`, `support.html`. Read `REVIEW.md` before adapting it.

Operator: DUCHENE SARL
Support, privacy and abuse contact: thib.duchene@gmail.com

These details were supplied by the owner. The drafts describe the iOS app and have not been published or legally finalized. Verify claims against actual backend behavior. Explicitly scope iOS-specific behavior; do not assume the web app behaves identically. Do not invent retention periods, deletion guarantees, provider details or legal company information. Identify missing facts precisely.

## Implementation

- Provide stable public HTTPS URLs, accessible without signing in. Prefer `/legal/privacy`, `/legal/terms` and `/legal/support`.
- Add discoverable links in the existing navigation/footer.
- Provide working contact email links with support and abuse-report subjects.
- Check direct navigation, refresh, mobile layout and links.
- Accurately describe Nostr public data, encrypted messages, media hosting, push notifications, Cashu wallet data and deletion limitations.
- Resolve factual issues before removing draft labels and setting an effective date.
- Preserve unrelated work and follow the existing deployment workflow.

Implement and validate the pages, clearly reporting whether they are live. Return exact final URLs and unresolved content questions. The iOS agent needs the published privacy and terms URLs for app configuration, and the support URL for App Store Connect.

This branch only supplies handoff documents; it does not install public routes or deploy the site.
