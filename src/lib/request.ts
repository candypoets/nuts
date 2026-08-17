import type { Request, RequestObject } from '@candypoets/nipworker';
import { fbArray } from '@candypoets/nipworker/utils';

export function toRequestObject(request: Request): RequestObject {
	return {
		ids: fbArray(request, 'ids').map((id) => id as string),
		authors: fbArray(request, 'authors').map((author) => author as string),
		kinds: fbArray(request, 'kinds'),
		tags: fbArray(request, 'tags').reduce(
			(acc, tag) => {
				const items = fbArray(tag, 'items');
				if (items.length >= 2) {
					const key = String(items[0]);
					if (key) {
						acc[key] = items.slice(1).map((item) => String(item));
					}
				}
				return acc;
			},
			{} as Record<string, string[]>
		),
		limit: request.limit() || undefined,
		since: request.since() || undefined,
		until: request.until() || undefined,
		relays: fbArray(request, 'relays').map((relay) => relay as string),
		cacheFirst: request.cacheFirst()
	};
}
