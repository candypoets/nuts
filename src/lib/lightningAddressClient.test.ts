import { afterEach, describe, expect, it, vi } from 'vitest';

import { constructClaimAuthorizationEvent, queryAliasAvailability } from './lightningAddressClient';

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
});
