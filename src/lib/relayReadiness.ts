export type RelayReadinessOptions = {
	fetch?: typeof globalThis.fetch;
	sleep?: (milliseconds: number) => Promise<void>;
	maxAttempts?: number;
	requestTimeoutMs?: number;
	initialRetryDelayMs?: number;
	maxRetryDelayMs?: number;
};

function nip11Url(relayUrl: string) {
	const normalized = relayUrl.trim().replace(/\/$/, '');
	if (/^wss:\/\//i.test(normalized)) return normalized.replace(/^wss:\/\//i, 'https://');
	if (/^ws:\/\//i.test(normalized)) return normalized.replace(/^ws:\/\//i, 'http://');
	return normalized;
}

function defaultSleep(milliseconds: number) {
	return new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

/**
 * Wait until the relay answers a valid NIP-11 request on the same endpoint that
 * will accept the subsequent WebSocket upgrade.
 */
export async function waitForRelayReady(
	relayUrl: string,
	options: RelayReadinessOptions = {}
): Promise<void> {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const sleep = options.sleep ?? defaultSleep;
	const maxAttempts = options.maxAttempts ?? 8;
	const requestTimeoutMs = options.requestTimeoutMs ?? 4000;
	const initialRetryDelayMs = options.initialRetryDelayMs ?? 500;
	const maxRetryDelayMs = options.maxRetryDelayMs ?? 4000;
	const url = nip11Url(relayUrl);
	let lastFailure = 'no response';

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const controller = new AbortController();
		const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);

		try {
			const response = await fetchImpl(url, {
				headers: { Accept: 'application/nostr+json' },
				cache: 'no-store',
				signal: controller.signal
			});
			if (response.ok) {
				const relayInfo: unknown = await response.json();
				if (relayInfo && typeof relayInfo === 'object' && !Array.isArray(relayInfo)) return;
				lastFailure = 'NIP-11 returned an invalid document';
			} else {
				lastFailure = `NIP-11 returned ${response.status}`;
			}
		} catch (error) {
			lastFailure = error instanceof Error ? error.message : 'NIP-11 request failed';
		} finally {
			globalThis.clearTimeout(timeout);
		}

		if (attempt + 1 < maxAttempts) {
			const retryDelay = Math.min(initialRetryDelayMs * 2 ** attempt, maxRetryDelayMs);
			await sleep(retryDelay);
		}
	}

	throw new Error(`The relay was created but did not become ready: ${lastFailure}.`);
}
