import type { RequestObject } from '@candypoets/nipworker';

export const communityDirectoryQuery = (pubkey: string, relays: string[] = []): RequestObject[] => [
	{
		kinds: [10012],
		authors: [pubkey],
		limit: 1,
		cacheFirst: true,
		closeOnEOSE: true,
		relays
	}
];

export const communityRoleSetsQuery = (
	addresses: string[],
	relays: string[] = []
): RequestObject[] =>
	addresses.map((address) => {
		const [, author, d] = address.split(':');
		return {
			kinds: [30002],
			authors: [author],
			tags: { '#d': [d] },
			limit: 1,
			cacheFirst: true,
			closeOnEOSE: true,
			relays
		};
	});
