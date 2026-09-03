import type { FeedKind } from 'src/controller/feed';

export type ExploreFeedTabId = 'notes' | 'media' | 'events' | 'highlights' | 'polls' | 'articles';

type ExploreFeedRoute = {
	slug: string;
	kinds: FeedKind[];
};

export const EXPLORE_FEED_ROUTES: Record<ExploreFeedTabId, ExploreFeedRoute> = {
	notes: { slug: '', kinds: [] },
	media: { slug: 'media', kinds: [20, 22] },
	events: { slug: 'live', kinds: [30311] },
	highlights: { slug: 'highlights', kinds: [9802] },
	polls: { slug: 'polls', kinds: [1068] },
	articles: { slug: 'articles', kinds: [30023] }
};

export function exploreFeedPath(tabId: ExploreFeedTabId): string {
	const slug = EXPLORE_FEED_ROUTES[tabId].slug;
	return slug ? `/explore/${slug}` : '/explore';
}

export function exploreFeedTabFromPath(pathname: string): ExploreFeedTabId {
	const segments = pathname.split(/[?#]/)[0].split('/').filter(Boolean);
	const exploreIndex = segments.indexOf('explore');
	const slug = exploreIndex === -1 ? '' : segments[exploreIndex + 1] || '';

	return (
		(Object.entries(EXPLORE_FEED_ROUTES).find(([, route]) => route.slug === slug)?.[0] as
			| ExploreFeedTabId
			| undefined) ?? 'notes'
	);
}

export function exploreFeedKinds(tabId: ExploreFeedTabId): FeedKind[] {
	return [...EXPLORE_FEED_ROUTES[tabId].kinds];
}

export function withExploreRelayParams(path: string, relays: string[]): string {
	const url = new URL(path, 'https://nuts.cash');
	url.searchParams.delete('relay');

	for (const relay of [...new Set(relays)]) {
		url.searchParams.append('relay', relay);
	}

	return `${url.pathname}${url.search}${url.hash}`;
}

export function exploreFeedHref(tabId: ExploreFeedTabId, relays: string[]): string {
	return withExploreRelayParams(exploreFeedPath(tabId), relays);
}

export function isExploreFeedPath(pathname: string): boolean {
	const segments = pathname.split(/[?#]/)[0].split('/').filter(Boolean);
	if (segments[0] !== 'explore' || segments.length > 2) return false;
	if (segments.length === 1) return true;

	return Object.values(EXPLORE_FEED_ROUTES).some(
		(route) => route.slug.length > 0 && route.slug === segments[1]
	);
}
