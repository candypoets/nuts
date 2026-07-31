export type PagerStackItemType = 'sub' | 'modal';

const targetedSubPaths = new Set([
	'nprofile',
	'nevent',
	'naddr',
	'kind4',
	'community',
	'store',
	'badge',
	'tags'
]);

const payloadlessSubPaths = new Set(['notifications']);

export function pagerSegmentType(
	segment: string,
	modalPaths: readonly string[]
): PagerStackItemType | undefined {
	const separatorIndex = segment.indexOf(':');
	const key = separatorIndex === -1 ? segment : segment.slice(0, separatorIndex);
	const hasPayload = separatorIndex !== -1 && separatorIndex < segment.length - 1;

	if (modalPaths.includes(key)) return 'modal';
	if (payloadlessSubPaths.has(key)) return 'sub';
	if (targetedSubPaths.has(key) && hasPayload) return 'sub';
	return undefined;
}
