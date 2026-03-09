import { createNostrManager, setGlobalManager } from '@candypoets/nipworker';

// Configure and set the global Nostr manager singleton
// This MUST run before any nipworker hooks are used
const manager = createNostrManager({
	// proxy: { url: 'ws://befree:7777/' }
});

setGlobalManager(manager);
