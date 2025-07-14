export const userQuery = (pubkey: string, relays: string[] = []) => [
	{
		kinds: [0, 10002, 10019],
		authors: [pubkey],
		limit: 5,
		cacheFirst: true,
		closeOnEOSE: true,
		relays
	}
];
