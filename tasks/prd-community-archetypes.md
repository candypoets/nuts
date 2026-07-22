# Community archetypes — specific needs mapped to the badge/role system

## Problem

A "community" on nuts.cash can be many things: a gym, a restaurant, a members' club, a
village, a professional network. Each shape has specific operational needs (table
reservations, menus, class schedules, recurring dues, door policy…). The create page
already asks admins to "pick the closest shape", but the selection was never persisted
or used — and the admin area is identical for every community.

This document enumerates the common community shapes, their specific needs, and checks
each need against the existing NIP-58 badge award + role system (kind 30009 definitions

- kind 8 awards, with `membership` / `event_access` badge types). Needs that fit are
  wired into the UI; needs that do not fit are called out explicitly.

## The archetypes

| Archetype                                | Examples                                 | Core needs                                                                           |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| **Sports club & gym**                    | football club, yoga studio, climbing gym | class/training schedule, monthly dues, coach staff, skill levels, check-in           |
| **Restaurant, café & bar** (hospitality) | restaurant, café, wine bar               | table reservations, menu, regulars/VIP club, theme nights                            |
| **Members' club & nightlife**            | private club, nightclub, association     | tiered recurring dues, door policy / guest list, committee roles, member-only events |
| **Village & neighborhood**               | village, district, HOA                   | free membership, announcements, civic roles, local events                            |
| **Startup & professional network**       | founder circle, coworking, alumni        | paid membership, mentor/organizer recognition, meetups, directory                    |
| **Other**                                | anything else                            | generic baseline                                                                     |

## Mapping each need to the badge/role system

### Fits directly (implemented as archetype-aware UI)

| Need                                          | Existing mechanism                                                     | Where it surfaces                                           |
| --------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Class / training schedule                     | calendar events (kind 31923, category `training`)                      | dashboard toolkit → "Schedule a class"                      |
| Monthly / yearly dues                         | `membership` badge (kind 30009 + `price`, `billing`, `stripe_account`) | Settings → Memberships                                      |
| Coach / committee / council / door staff      | role badges (kind 30009 + `permission` tags), awarded via kind 8       | dashboard toolkit → one-click suggested roles per archetype |
| Skill levels, mentor badges                   | role badges **without** permissions (pure recognition)                 | People → Roles                                              |
| Door policy / guest list / member-only events | event admission gated on selected badges (`access` + `required_badge`) | Events → create modal                                       |
| Paid entrance / ticketed night                | `event_access` badge (Stripe or ecash sats) + QR check-in (scan modal) | Events → create modal                                       |
| Free membership via invites                   | invite tokens → membership badge via `/redeem`                         | Invites                                                     |
| Announcements                                 | posts to the community relay                                           | dashboard → "Make a post"                                   |

### Does not fit the badge/role system (explicit non-fits)

| Need                                                 | Why it doesn't fit                                                                                                                                                                                                                                                             | Interim solution (implemented)                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Table reservations**                               | A reservation is slot inventory (date × time × party size), not a durable attribute of a member. Awarding a badge per seating inverts the model: badges say _who you are_, reservations say _when you show up_. A proper system needs per-slot capacity, holds, cancellations. | `booking_url` field on the community profile, rendered as a **"Book a table"** button on the public community page (works with any external booking tool). |
| **Menu**                                             | Content, not membership state.                                                                                                                                                                                                                                                 | `menu_url` field on the community profile, rendered as a **"View menu"** button on the public community page.                                              |
| **Resource booking** (coworking desks, village hall) | Same slot-inventory problem as reservations.                                                                                                                                                                                                                                   | Noted for later; the `booking_url` field covers it too.                                                                                                    |
| **Recurring class templates**                        | Events are single instances; recurrence is an editor concern, not a badge one.                                                                                                                                                                                                 | Later: recurring-event templates in the events page.                                                                                                       |

## What was built

1. **`src/lib/communityTypes.ts`** — the archetype registry: label, icon, tagline,
   create-page highlights, dashboard toolkit actions, and suggested roles (with
   permissions) per archetype.
2. **`src/lib/communityProfile.ts`** — a community profile event (kind 30078,
   `d = nuts-community-profile`, published only to the community relay) carrying the
   archetype `type`, `description`, `image`, and hospitality extras (`menu_url`,
   `booking_url`). This also fixes the create-page data loss where type, description
   and image were collected and then dropped.
3. **Create page** — real archetype picker with per-type highlights; on creation the
   profile event is published to the new relay (image uploaded via the existing
   Blossom/NIP-96 helper when provided).
4. **Settings → Community tab** — edit archetype, description, image and (for
   hospitality) menu/booking URLs; republishes the profile event.
5. **Admin dashboard → archetype toolkit** — a widget area that renders the
   archetype's actions (deep links into events, memberships, roles, invites with the
   right presets) and one-click creation of the suggested role badges (kind 30009).
6. **Public community page** — shows the profile description, an archetype pill, and
   "View menu" / "Book a table" buttons when the hospitality URLs are set.

## Out of scope (future)

- True reservation/slot-booking engine (needs inventory, holds, cancellation policy).
- In-app menu editor (long-form content on the relay is the natural future home).
- Archetype-preset billing cycle in the membership modal (registry already carries
  `membershipHint` copy for this).
