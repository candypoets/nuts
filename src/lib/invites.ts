import { getManager } from '@candypoets/nipworker';
import { useSignEvent } from '@candypoets/nipworker/hooks';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

type SignedEvent = {
	id: string;
	pubkey: string;
	created_at: number;
	kind: number;
	tags: string[][];
	content: string;
	sig: string;
};

function base64Url(value: string) {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256Hex(value: string) {
	return bytesToHex(sha256(new TextEncoder().encode(value)));
}

export function normalizeSignedEvent(value: string | SignedEvent): SignedEvent {
	const event = typeof value === 'string' ? JSON.parse(value) : value;
	return {
		id: event.id,
		pubkey: event.pubkey,
		created_at: event.created_at,
		kind: event.kind,
		tags: event.tags,
		content: event.content,
		sig: event.sig
	};
}

async function selectExpectedSigner(expectedPubkey: string) {
	const manager = getManager();
	if (manager.getActivePubkey() === expectedPubkey) return;
	if (!manager.getAccounts()[expectedPubkey]) {
		throw new Error('The selected account is not available to the active signer');
	}

	await new Promise<void>((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			manager.removeEventListener('auth', handleAuth);
			reject(new Error('Timed out while selecting the community administrator signer'));
		}, 5000);
		function handleAuth(event: Event) {
			const detail = (event as CustomEvent<{ pubkey?: string; hasSigner?: boolean }>).detail;
			if (detail.pubkey !== expectedPubkey) return;
			window.clearTimeout(timeout);
			manager.removeEventListener('auth', handleAuth);
			if (!detail.hasSigner) {
				reject(new Error('The selected community administrator account is read-only'));
				return;
			}
			resolve();
		}
		manager.addEventListener('auth', handleAuth);
		manager.switchAccount(expectedPubkey);
	});
}

export async function makeInviteAuthorization(url: string, body: string, expectedPubkey?: string) {
	if (expectedPubkey) await selectExpectedSigner(expectedPubkey);
	const payloadHash = await sha256Hex(body);
	const unsigned = {
		kind: 27235,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['u', url],
			['method', 'POST'],
			['payload', payloadHash]
		],
		content: ''
	};

	return await new Promise<string>((resolve, reject) => {
		let settled = false;
		const timeout = window.setTimeout(() => {
			settled = true;
			reject(new Error('Timed out while waiting for the Nostr signer'));
		}, 10_000);

		function settle(callback: () => void) {
			if (settled) return;
			settled = true;
			window.clearTimeout(timeout);
			callback();
		}

		try {
			useSignEvent(unsigned, (signedEvent) => {
				try {
					const normalized = normalizeSignedEvent(signedEvent);
					if (expectedPubkey && normalized.pubkey !== expectedPubkey) {
						settle(() =>
							reject(
								new Error('The active signer does not match the community administrator account')
							)
						);
						return;
					}
					settle(() => resolve(`Nostr ${base64Url(JSON.stringify(normalized))}`));
				} catch (error) {
					settle(() => reject(error));
				}
			});
		} catch (error) {
			settle(() => reject(error));
		}
	});
}
