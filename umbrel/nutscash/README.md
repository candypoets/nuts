# NutsCash Umbrel package scaffold

This directory contains a first-pass Umbrel App Store packaging scaffold for NutsCash.

## Files

- `umbrel-app.yml` — app metadata manifest
- `docker-compose.yml` — app runtime definition

## What is still needed before official submission

1. **✅ GitHub Action updated for multi-arch** (`linux/amd64` + `linux/arm64`)
   - The workflow now builds for both platforms
   - After the next release build, update `docker-compose.yml` with the new multi-arch digest:
     ```bash
     docker pull ticruz38/nuts:latest
     docker inspect ticruz38/nuts:latest --format='{{index .RepoDigests 0}}'
     ```
   - Then update the image line in `docker-compose.yml` with the new digest
   
2. ✅ **Gallery assets** - Added 4 screenshots (1440x900px PNG format) and icon.svg
   - Screenshots show: Login page, App views
   - Note: Screenshots currently show the login page as the app requires Nostr key authentication
   
3. **Verify the dependency behavior with `nostr-relay` on real umbrelOS.**
   - The manifest declares `dependencies: [nostr-relay]`
   - Relay defaults include `ws://${DEVICE_HOSTNAME}:4848` for local Nostr Relay
   
4. **Update submission field** - Add the PR link to umbrel-apps repo once submitted
   - Current: `submission: ''`
   - Should be: `submission: https://github.com/getumbrel/umbrel-apps/pull/XXX`

5. **Consider adding release notes** when publishing updates

## Notes about proxy endpoints

### WebSocket Relay Proxy (`/ws-proxy`)
The server attaches a WebSocket relay proxy at `/ws-proxy` for proxying Nostr relay connections. This helps with:
- CORS bypass for browser connections
- Connecting to `.onion` relays via SOCKS (if configured)

### Media Proxy
There is **no** `/api/proxy/*` endpoint in this app. The `src/lib/proxy.ts` functions are deprecated and return original URLs directly.

## Notes about dependency on Nostr Relay

- The manifest currently declares:
  - `dependencies: [nostr-relay]`
- Relay defaults include `ws://${DEVICE_HOSTNAME}:4848` so NutsCash can talk to the local Nostr Relay app by default.

## Local test

Copy `umbrel/nutscash` into your umbrel-apps fork as `nutscash/` and test install on umbrelOS.
