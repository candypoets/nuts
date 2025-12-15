import type { ParsedEvent } from '@candypoets/nipworker';

/**
 * Safely compute the deterministic hash for an event id.
 */
export function getEventHash(e: ParsedEvent | undefined | null): number | undefined {
	return e?.id?.()?.fnv1aHash?.();
}

/**
 * Binary search insertion index by createdAt timestamp for a descending-sorted array.
 */
export function binarySearchDescByTs(arr: ParsedEvent[], ts: number): number {
	let lo = 0;
	let hi = arr.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if ((arr[mid]?.createdAt?.() ?? 0) < ts) {
			hi = mid;
		} else {
			lo = mid + 1;
		}
	}
	return lo;
}

/**
 * Insert/update into a descending-sorted feed while keeping a map index in sync.
 * Mutates the array in place and returns true if the array changed (inserted).
 * Does NOT trigger any framework reactivity by itself.
 */
export function upsertIntoSortedFeed(
	feed: ParsedEvent[],
	feedMap: Map<number, ParsedEvent>,
	e: ParsedEvent
): boolean {
	const id = getEventHash(e);
	if (!id) return false;

	if (feedMap.has(id)) {
		feedMap.set(id, e);
		return false;
	}
	feedMap.set(id, e);

	const ts = e.createdAt?.() ?? 0;
	if (feed.length === 0) {
		feed.push(e);
		return true;
	}
	const headTs = feed[0]?.createdAt?.() ?? 0;
	if (ts >= headTs) {
		feed.unshift(e);
		return true;
	}
	const tailTs = feed[feed.length - 1]?.createdAt?.() ?? 0;
	if (ts <= tailTs) {
		feed.push(e);
		return true;
	}

	const idx = binarySearchDescByTs(feed, ts);
	feed.splice(idx, 0, e);
	return true;
}

/**
 * Prune the tail of the feed if it exceeds max, and drop corresponding entries from indexes/sets.
 * Mutates the array in place.
 */
export function pruneFeed(
	feed: ParsedEvent[],
	feedMap: Map<number, ParsedEvent>,
	seenIds: Set<number>,
	max: number
): void {
	if (feed.length <= max) return;
	const excess = feed.length - max;
	const removed = feed.splice(feed.length - excess, excess);
	for (const e of removed) {
		const id = getEventHash(e);
		if (id) {
			feedMap.delete(id);
			seenIds.delete(id);
		}
	}
}
