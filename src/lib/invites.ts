import { useSignEvent } from '@candypoets/nipworker/hooks';

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
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
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

export async function makeInviteAuthorization(url: string, body: string) {
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
		try {
			useSignEvent(unsigned, (signedEvent) => {
				try {
					resolve(`Nostr ${base64Url(JSON.stringify(normalizeSignedEvent(signedEvent)))}`);
				} catch (error) {
					reject(error);
				}
			});
		} catch (error) {
			reject(error);
		}
	});
}
