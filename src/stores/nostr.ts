import { browser } from '$app/environment';
import type { RelayPool } from 'nostr-relaypool';
import type { NostrMessage } from '../model/nostrMessage';

import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { NPool, NRelay1, NSecSigner } from '@nostrify/nostrify';
import type { NostrEvent, UnsignedEvent } from 'nostr-tools';
import { kinds, nip19 } from 'nostr-tools';
import { get, writable } from 'svelte/store';
import type { NostrRelay } from '../model/relay';
// import { db, proofs } from './db';
// import { getDecryptedContent } from 'src/actions/chat';
// import { getDecodedToken, type Proof } from '@cashu/cashu-ts';

const initialValueSting: string = browser
	? window.localStorage.getItem('use-nostr') ?? 'true'
	: 'true';

const initialValue: boolean = JSON.parse(initialValueSting);

const useNostr = writable<boolean>(initialValue);

useNostr.subscribe((value) => {
	if (browser) {
		window.localStorage.setItem('use-nostr', JSON.stringify(value));
	}
});

const initialValueExternalKeySting: string = browser
	? window.localStorage.getItem('use-external-nostr') ?? 'false'
	: 'false';

const initialValueExternalKey: boolean = JSON.parse(initialValueExternalKeySting);

const useExternalNostrKey = writable<boolean>(initialValueExternalKey);

useExternalNostrKey.subscribe((value) => {
	if (browser) {
		window.localStorage.setItem('use-external-nostr', JSON.stringify(value));
	}
});

const initialValuePrivKeySting: string = browser
	? window.localStorage.getItem('nostr-privkey') ?? ''
	: '';

const nostrPrivKey = writable<string>(initialValuePrivKeySting);
export const signer = writable<NSecSigner>();

export const profile = writable<{ name?: string; picture?: string; about?: string; nuts?: string }>(
	{}
);

// check if a cashu token is present on the profile, decrypt it and add the proof to the db
// profile.subscribe(async (value) => {
// 	if (value.nuts && !get(proofs).length && browser) {
// 		const content = await getDecryptedContent(get(nostrPubKey), value.nuts);
// 		const cashu = getDecodedToken(content);
// 		cashu.token.forEach((t) => {
// 			t.proofs.forEach((p) => {
// 				get(db).keysets.put({ id: p.id, mint: t.mint });
// 			});
// 		});
// 		const proofs = cashu.token.reduce((acc, cur) => [...acc, ...cur.proofs], [] as Proof[]);
// 		get(db).proofs.bulkPut(proofs);
// 	}
// });

export function decodePrivKey(value: string): Uint8Array {
	let pk;
	if (value.startsWith('nsec')) {
		const { type, data } = nip19.decode(value);
		pk = data;
	} else {
		pk = hexToBytes(value);
	}
	return pk;
}

nostrPrivKey.subscribe((value) => {
	if (!value) return;
	const pk = decodePrivKey(value);
	if (browser) {
		window.localStorage.setItem('nostr-privkey', value);
	}

	signer.set(new NSecSigner(pk));
	setTimeout(() => {
		// get the contact info from the pubkey
		const messages = pool.req([{ kinds: [kinds.Metadata], limit: 1, authors: [get(nostrPubKey)] }]);

		(async () => {
			for await (const message of messages) {
				if (message[0] === 'CLOSED') break;
				if (message[0] !== 'EVENT') continue;
				const event = message[2];
				profile.set(JSON.parse(event.content));
			}
		})();
	}, 1000);
});

const initialValuePubKeySting: string = browser
	? window.localStorage.getItem('nostr-pubkey') ?? ''
	: '';

const nostrPubKey = writable<string>(initialValuePubKeySting);

nostrPubKey.subscribe((value) => {
	if (browser) {
		window.localStorage.setItem('nostr-pubkey', value);
	}
});

const initialValueStingNostrMessages: string = browser
	? window.localStorage.getItem('nostr-messages') ?? '[]'
	: '[]';

const initialValueNostrMessage: Array<NostrMessage> = JSON.parse(initialValueStingNostrMessages);

const nostrMessages = writable<Array<NostrMessage>>(initialValueNostrMessage);

nostrMessages.subscribe((value) => {
	if (browser) {
		window.localStorage.setItem('nostr-messages', JSON.stringify(value));
	}
});

const initialValueStringNostrRelays: string = browser
	? window.localStorage.getItem('nostr-relays') ??
		'[{"url": "wss://relay.damus.io","isActive":"true"}, {"url": "wss://nostr.einundzwanzig.space/","isActive":"true"}, {"url": "wss://relay.primal.net","isActive":"true"}]'
	: '[{"url": "wss://relay.damus.io","isActive":"true"}, {"url": "wss://nostr.einundzwanzig.space/","isActive":"true"}, {"url": "wss://relay.primal.net","isActive":"true"}]';

const initialValueNostrRelays: Array<NostrRelay> = JSON.parse(initialValueStringNostrRelays);

const nostrRelays = writable<Array<NostrRelay>>(initialValueNostrRelays);

nostrRelays.subscribe((value) => {
	if (browser) {
		window.localStorage.setItem('nostr-relays', JSON.stringify(value));
	}
});

const nostrPool = writable<RelayPool>();

const createNewNostrKeys = (privateKey?: string) => {
	const priv = privateKey ? hexToBytes(privateKey) : schnorr.utils.randomPrivateKey();
	nostrPrivKey.set(bytesToHex(priv));
	nostrPubKey.set(bytesToHex(schnorr.getPublicKey(priv)));
};

export const pool = new NPool({
	open(url) {
		return new NRelay1(url);
	},
	async reqRouter(filters) {
		return new Map([
			['wss://relay.damus.io', filters],
			['wss://nostr.einundzwanzig.space/', filters],
			['wss://relay.primal.net', filters],
			['wss://relay.nuts.cash', filters]
			// ['ws://umbrel:4848', filters]
		]);
	},
	async eventRouter(event) {
		return ['wss://relay.damus.io', 'wss://nostr.einundzwanzig.space/', 'wss://relay.primal.net'];
	}
});

export const signAndSend = async (event: UnsignedEvent) => {
	if (window.nostr) {
		event = await window.nostr.signEvent(event);
	} else {
		event = await get(signer).signEvent(event);
	}

	pool.event(event as NostrEvent);
};

export {
	createNewNostrKeys,
	nostrMessages,
	nostrPool,
	nostrPrivKey,
	nostrPubKey,
	nostrRelays,
	useExternalNostrKey,
	useNostr
};
