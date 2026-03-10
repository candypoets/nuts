import { createNostrManager, setGlobalManager } from '@candypoets/nipworker';

console.log('client hooks here');

// Get proxy URL from environment variable (Vite exposes env vars prefixed with VITE_)
const proxyUrl = import.meta.env.VITE_NIPWORKER_PROXY_URL;

// Configure and set the global Nostr manager singleton
// This MUST run before any nipworker hooks are used
const manager = createNostrManager({
	...(proxyUrl ? { proxy: { url: proxyUrl } } : {})
});

setGlobalManager(manager);
