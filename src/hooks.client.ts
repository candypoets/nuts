import { createNostrManager, setManager } from '@candypoets/nipworker';
import { hexToBytes } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { key } from 'src/controller/key';
import { resetAccountNostrState } from 'src/controller/nostr';

console.log('client hooks here with url', import.meta.env.VITE_NIPWORKER_PROXY_URL);

// Get proxy URL from environment variable (Vite exposes env vars prefixed with VITE_)
const proxyUrl = import.meta.env.VITE_NIPWORKER_PROXY_URL;

// Configure and set the global Nostr manager singleton
// This MUST run before any nipworker hooks are used
const manager = createNostrManager({
	...(proxyUrl ? { proxy: { url: proxyUrl } } : {})
});

manager.addEventListener('auth', (event) => {
	const detail = (
		event as CustomEvent<{ pubkey?: string | null; hasSigner?: boolean; secretKey?: unknown }>
	).detail;
	const pubkey = detail.pubkey;

	if (!pubkey) {
		key.set({ pub: '', npub: '' });
		queueMicrotask(resetAccountNostrState);
		return;
	}

	const secretKey =
		typeof detail.secretKey === 'string' && /^[0-9a-f]{64}$/i.test(detail.secretKey)
			? detail.secretKey
			: undefined;

	key.set({
		pub: pubkey,
		npub: nip19.npubEncode(pubkey),
		hasSigner: Boolean(detail.hasSigner),
		...(secretKey
			? {
					priv: secretKey,
					nsec: nip19.nsecEncode(hexToBytes(secretKey))
				}
			: {})
	});
	queueMicrotask(resetAccountNostrState);
});

manager.addEventListener('logout', () => {
	key.set({ pub: '', npub: '' });
	queueMicrotask(resetAccountNostrState);
});

setManager(manager);
