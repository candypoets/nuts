import { beforeEach, describe, expect, it, vi } from 'vitest';

const managerState = vi.hoisted(() => ({
	activePubkey: '',
	accounts: {} as Record<string, unknown>
}));

const signState = vi.hoisted(() => ({
	unsigned: undefined as unknown,
	respondWith: undefined as unknown
}));

vi.mock('@candypoets/nipworker', () => ({
	getManager: () => ({
		getActivePubkey: () => managerState.activePubkey,
		getAccounts: () => managerState.accounts,
		switchAccount: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	})
}));

vi.mock('@candypoets/nipworker/hooks', () => ({
	useSignEvent: (unsigned: unknown, callback: (signed: unknown) => void) => {
		signState.unsigned = unsigned;
		callback(signState.respondWith);
	}
}));

import { makeInviteAuthorization, normalizeSignedEvent, sha256Hex } from './invites';

const ADMIN_PUBKEY = 'a'.repeat(64);

const signedEvent = {
	id: 'b'.repeat(64),
	pubkey: ADMIN_PUBKEY,
	created_at: 1_750_000_000,
	kind: 27235,
	tags: [
		['u', 'https://relay.example.com/invites'],
		['method', 'POST'],
		['payload', 'c'.repeat(64)]
	],
	content: '',
	sig: 'd'.repeat(128),
	extraField: 'must be dropped'
};

function decodeAuthorization(authorization: string) {
	expect(authorization.startsWith('Nostr ')).toBe(true);
	const base64 = authorization.slice('Nostr '.length).replace(/-/g, '+').replace(/_/g, '/');
	return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

describe('invite authorization (NIP-98)', () => {
	beforeEach(() => {
		vi.stubGlobal('window', { setTimeout, clearTimeout });
		managerState.activePubkey = ADMIN_PUBKEY;
		managerState.accounts = { [ADMIN_PUBKEY]: {} };
		signState.unsigned = undefined;
		signState.respondWith = signedEvent;
	});

	it('hashes the request body for the payload tag', async () => {
		await expect(sha256Hex('')).resolves.toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		);
		await expect(sha256Hex('{"max_uses":1}')).resolves.toMatch(/^[0-9a-f]{64}$/);
	});

	it('normalizes a signed event down to the NIP-98 fields', () => {
		const fromObject = normalizeSignedEvent(signedEvent);
		expect(fromObject).toEqual({
			id: signedEvent.id,
			pubkey: signedEvent.pubkey,
			created_at: signedEvent.created_at,
			kind: 27235,
			tags: signedEvent.tags,
			content: '',
			sig: signedEvent.sig
		});
		expect(normalizeSignedEvent(JSON.stringify(signedEvent))).toEqual(fromObject);
	});

	it('builds a kind 27235 auth event for the invite endpoint', async () => {
		const body = JSON.stringify({ max_uses: 1 });
		const authorization = await makeInviteAuthorization(
			'https://relay.example.com/invites',
			body,
			ADMIN_PUBKEY
		);

		const unsigned = signState.unsigned as {
			kind: number;
			tags: string[][];
			content: string;
		};
		expect(unsigned.kind).toBe(27235);
		expect(unsigned.tags).toEqual([
			['u', 'https://relay.example.com/invites'],
			['method', 'POST'],
			['payload', await sha256Hex(body)]
		]);

		expect(decodeAuthorization(authorization)).toEqual(normalizeSignedEvent(signedEvent));
	});

	it('rejects when the signer does not match the community admin account', async () => {
		signState.respondWith = { ...signedEvent, pubkey: 'e'.repeat(64) };
		await expect(
			makeInviteAuthorization('https://relay.example.com/invites', '{}', ADMIN_PUBKEY)
		).rejects.toThrow('does not match the community administrator account');
	});

	it('rejects when the admin account is not available to the signer', async () => {
		managerState.activePubkey = 'f'.repeat(64);
		managerState.accounts = {};
		await expect(
			makeInviteAuthorization('https://relay.example.com/invites', '{}', ADMIN_PUBKEY)
		).rejects.toThrow('not available to the active signer');
	});
});
