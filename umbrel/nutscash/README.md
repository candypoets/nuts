# NutsCash Umbrel package scaffold

This directory contains a first-pass Umbrel App Store packaging scaffold for NutsCash.

## Files

- `umbrel-app.yml` — app metadata manifest
- `docker-compose.yml` — app runtime definition

## What is still needed before official submission

1. Replace Docker image tag+digest with a **multi-arch** image digest (`linux/amd64` + `linux/arm64`).
2. Add gallery assets to the final Umbrel PR (3–5 images).
3. Verify the dependency behavior with `nostr-relay` on real umbrelOS.
4. Consider adding an Umbrel hook if you want dynamic relay defaults (Tor/hostname aware).

## Notes about dependency on Nostr Relay

- The manifest currently declares:
  - `dependencies: [nostr-relay]`
- Relay defaults include `ws://${DEVICE_HOSTNAME}:4848` so NutsCash can talk to the local Nostr Relay app by default.

## Local test

Copy `umbrel/nutscash` into your umbrel-apps fork as `nutscash/` and test install on umbrelOS.
