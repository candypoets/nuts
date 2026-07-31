import { describe, expect, it } from 'vitest';

import { shouldShowLiveNotificationToast } from './notificationToast';

describe('shouldShowLiveNotificationToast', () => {
	it('rejects replayed history after initial relay synchronization', () => {
		expect(shouldShowLiveNotificationToast(99, 100, true)).toBe(false);
	});

	it('rejects events while the initial relay synchronization is in progress', () => {
		expect(shouldShowLiveNotificationToast(101, 100, false)).toBe(false);
	});

	it('accepts current-session events after initial relay synchronization', () => {
		expect(shouldShowLiveNotificationToast(100, 100, true)).toBe(true);
		expect(shouldShowLiveNotificationToast(101, 100, true)).toBe(true);
	});
});
