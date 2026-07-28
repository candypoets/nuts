import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	constructClaimAuthorizationEvent,
	constructProofAuthorizationEvent,
	queryAliasAvailability,
	queryClaimableProofs
} from './lightningAddressClient';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('lightning address client', () => {
	it('constructs the expected payload-bound NIP-98 event without Web Crypto', async () => {
		vi.stubGlobal('crypto', undefined);

		const event = await constructClaimAuthorizationEvent(
			{
				alias: 'alice',
				mintUrl: 'https://mint.example',
				p2pkPubkey: 'p2pk'
			},
			'pubkey',
			'https://example.com/api/claims'
		);

		expect(event.tags).toEqual([
			['u', 'https://example.com/api/claims'],
			['method', 'POST'],
			['payload', '7b68f33784577c704cd18a95b2e71e05acf57989bcb5389d92fcff230bd5cdb4']
		]);
	});

	it('treats a missing alias as available', async () => {
		const fetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ status: 'error', reason: 'Not found' }), {
				status: 404
			})
		);
		vi.stubGlobal('fetch', fetch);

		await expect(queryAliasAvailability(' alice ')).resolves.toEqual({
			status: 'success',
			available: true
		});
		expect(fetch).toHaveBeenCalledWith('/api/claims/alice', {
			headers: { Accept: 'application/json' }
		});
	});

	it('constructs a GET NIP-98 event for the exact proofs URL', () => {
		const url = 'https://example.com/api/proofs?since=123000';
		const event = constructProofAuthorizationEvent('pubkey', url);

		expect(event.pubkey).toBe('pubkey');
		expect(event.tags).toEqual([
			['u', url],
			['method', 'GET']
		]);
		expect(event.content).toBe('');
	});

	it('queries claimable proofs with the signed event', async () => {
		const data = {
			proofs: [],
			receivedThrough: 123000
		};
		const fetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ status: 'success', data }), {
				status: 200
			})
		);
		vi.stubGlobal('fetch', fetch);

		const event = {
			id: 'id',
			pubkey: 'pubkey',
			created_at: 123,
			kind: 27235,
			tags: [
				['u', 'https://example.com/api/proofs'],
				['method', 'GET']
			],
			content: '',
			sig: 'sig'
		};

		await expect(queryClaimableProofs(event, 'https://example.com/api/proofs')).resolves.toEqual(
			data
		);
		expect(fetch).toHaveBeenCalledWith('https://example.com/api/proofs', {
			headers: {
				Accept: 'application/json',
				Authorization: `Nostr ${btoa(JSON.stringify(event))}`
			}
		});
	});
});
