import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import type { EventTemplate } from 'nostr-tools';

export function cashuP2pkPublicKey(secretKey: Uint8Array): string {
	return bytesToHex(secp256k1.getPublicKey(secretKey, true));
}

export function isCashuP2pkPublicKey(value: string | undefined | null): boolean {
	return /^(02|03)[0-9a-f]{64}$/i.test(value || '') || /^04[0-9a-f]{128}$/i.test(value || '');
}

export function buildCashuProfile(
	secretKey: Uint8Array,
	mints: string[],
	createdAt: number
): EventTemplate {
	return {
		kind: 10019,
		created_at: createdAt,
		content: '',
		tags: [
			...mints.map((mint) => ['mint', mint]),
			['pubkey', cashuP2pkPublicKey(secretKey)]
		]
	};
}
