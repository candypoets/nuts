import { describe, expect, it } from 'vitest';

import { pagerSegmentType } from './pagerRoutes';

const modalPaths = ['profile', 'reply'];

describe('pagerSegmentType', () => {
	it('keeps the payload-less notifications feed as a sub-route', () => {
		expect(pagerSegmentType('notifications', modalPaths)).toBe('sub');
	});

	it('does not treat bare targeted page names as sub-routes', () => {
		expect(pagerSegmentType('store', modalPaths)).toBeUndefined();
		expect(pagerSegmentType('community', modalPaths)).toBeUndefined();
	});

	it('recognizes targeted sub-routes and modal routes', () => {
		expect(pagerSegmentType('store:wss%3A%2F%2Frelay.example', modalPaths)).toBe('sub');
		expect(pagerSegmentType('nevent:nevent1example', modalPaths)).toBe('sub');
		expect(pagerSegmentType('profile', modalPaths)).toBe('modal');
	});
});
