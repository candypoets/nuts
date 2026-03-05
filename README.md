# NutsCash

A Nostr client with integrated Cashu wallet. Browse your Nostr feed, interact with notes, and send/receive Bitcoin payments over Lightning via Cashu ecash tokens.

## Features

### Nostr Client

- **Feed browsing** - Timeline with posts from people you follow
- **Rich content support** - Articles (Kind 30023), Livestreams (Kind 30311), Videos, Images
- **Interactions** - Like, zap, reply, repost, follow/unfollow
- **Notifications** - Mentions, replies, zaps
- **Direct messages** - Encrypted DMs
- **Search & Explore** - Discover content and users
- **NIP-05 verification** - User identifier support

### Cashu Wallet

- **Multi-mint support** - Add and manage multiple Cashu mints
- **Send/Receive** - Ecash tokens via QR codes or text
- **Lightning integration** - Mint tokens via Lightning invoices, melt tokens to pay invoices
- **Nostr payments** - Send/receive tokens over Nostr DMs
- **Inter-mint swaps** - Swap tokens between different mints
- **Transaction history** - Track all your mint/melt/send/receive activity
- **Backup & recovery** - Export/import token backups

### Technical

- **PWA** - Installable as a Progressive Web App
- **Mobile-first** - Responsive design for mobile and desktop
- **QR Scanner** - Scan to pay/receive
- **Offline support** - Works without constant internet connection

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Frontend framework
- [TailwindCSS](https://tailwindcss.com/) - Styling
- [Cashu TS](https://github.com/cashubtc/cashu-ts) - Cashu protocol implementation
- [Nostr Tools](https://github.com/nbd-wtf/nostr-tools) - Nostr protocol
- [Vite PWA](https://vite-pwa-org.netlify.app/) - PWA capabilities

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Requirements

- Node.js 22+

## Docker

```bash
docker build -t nutscash .
docker run -p 3000:3000 nutscash
```

## Umbrel App

NutsCash includes an [Umbrel](https://umbrel.com) app configuration for easy self-hosting.

See `umbrel/nutscash/` for the app scaffold.

## ⚠️ Disclaimer

This app handles real Bitcoin (sats). While Cashu provides privacy and convenience, use only amounts you're willing to lose during the beta phase.

## License

[MIT](LICENSE.md)
