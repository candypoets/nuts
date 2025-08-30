import type { Request, RequestObject } from '@candypoets/nipworker';
import { fbArray } from '@candypoets/nipworker/utils';
import type { ByteString } from 'node_modules/@candypoets/nipworker/dist/lib/ByteString';

export function toRequestObject(request: Request): RequestObject {
	return {
		ids: fbArray(request, 'ids').map((id) => (id as ByteString)?.toString()),
		authors: fbArray(request, 'authors').map((author) => (author as ByteString)?.toString()),
		kinds: fbArray(request, 'kinds'),
		tags: fbArray(request, 'tags').reduce(
			(acc, tag) => {
				const items = fbArray(tag, 'items');
				if (items.length >= 2) {
					const key = items[0]?.toString();
					if (key) {
						acc[key] = items.slice(1).map((item) => item?.toString());
					}
				}
				return acc;
			},
			{} as Record<string, string[]>
		),
		limit: request.limit() || undefined,
		since: request.since() || undefined,
		until: request.until() || undefined,
		relays: fbArray(request, 'relays').map((relay) => (relay as ByteString)?.toString()),
		cacheFirst: request.cacheFirst(),
		closeOnEOSE: request.closeOnEose()
	};
}
