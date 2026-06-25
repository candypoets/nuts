import { json, type RequestHandler } from '@sveltejs/kit';

function relayHttpUrl(relay: string) {
	const normalized = relay.trim().replace(/\/$/, '');
	if (/^wss:\/\//i.test(normalized)) return normalized.replace(/^wss:\/\//i, 'https://');
	if (/^ws:\/\//i.test(normalized)) return normalized.replace(/^ws:\/\//i, 'http://');
	return normalized;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const relay = url.searchParams.get('relay');
	if (!relay) {
		return json({ error: 'Missing relay parameter' }, { status: 400 });
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 7000);

	try {
		const response = await fetch(relayHttpUrl(relay), {
			headers: { Accept: 'application/nostr+json' },
			signal: controller.signal
		});

		if (!response.ok) {
			return json(
				{ error: `NIP-11 request failed with ${response.status}` },
				{ status: response.status }
			);
		}

		return json(await response.json());
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to load relay info' },
			{ status: 502 }
		);
	} finally {
		clearTimeout(timeout);
	}
};
