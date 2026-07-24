import { describe, expect, it, vi } from 'vitest';

import { waitForRelayReady } from './relayReadiness';

describe('waitForRelayReady', () => {
	it('probes the relay NIP-11 endpoint', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ name: 'Moonshot' }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);

		await waitForRelayReady('wss://moonshot.relays.nuts.cash/', { fetch });

		expect(fetch).toHaveBeenCalledOnce();
		expect(fetch).toHaveBeenCalledWith(
			'https://moonshot.relays.nuts.cash',
			expect.objectContaining({
				cache: 'no-store',
				headers: { Accept: 'application/nostr+json' }
			})
		);
	});

	it('retries until NIP-11 becomes available', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response('', { status: 503 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Moonshot' }), { status: 200 }));
		const sleep = vi.fn(async () => undefined);

		await waitForRelayReady('wss://moonshot.relays.nuts.cash', {
			fetch,
			sleep,
			maxAttempts: 2
		});

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(500);
	});

	it('reports when the relay never becomes ready', async () => {
		const fetch = vi.fn(async () => new Response('', { status: 502 }));

		await expect(
			waitForRelayReady('wss://moonshot.relays.nuts.cash', {
				fetch,
				sleep: async () => undefined,
				maxAttempts: 2
			})
		).rejects.toThrow('The relay was created but did not become ready: NIP-11 returned 502.');
	});
});
