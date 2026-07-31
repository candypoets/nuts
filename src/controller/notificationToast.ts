import { writable } from 'svelte/store';

export type NotificationToast = {
	id: string;
	title: string;
	message: string;
	targetEventId: string;
	relays: string[];
};

const DISPLAY_DURATION_MS = 6000;
const MAX_VISIBLE_TOASTS = 4;
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const notificationToasts = writable<NotificationToast[]>([]);

export function shouldShowLiveNotificationToast(
	createdAt: number,
	subscriptionStartedAt: number,
	initialSyncComplete: boolean
) {
	return initialSyncComplete && createdAt >= subscriptionStartedAt;
}

export function dismissNotificationToast(id: string) {
	const timer = dismissTimers.get(id);
	if (timer) clearTimeout(timer);
	dismissTimers.delete(id);
	notificationToasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
}

export function showNotificationToast(toast: NotificationToast) {
	dismissNotificationToast(toast.id);

	notificationToasts.update((current) => {
		const next = [toast, ...current].slice(0, MAX_VISIBLE_TOASTS);
		const visibleIds = new Set(next.map((item) => item.id));
		for (const item of current) {
			if (!visibleIds.has(item.id)) {
				const timer = dismissTimers.get(item.id);
				if (timer) clearTimeout(timer);
				dismissTimers.delete(item.id);
			}
		}
		return next;
	});

	dismissTimers.set(
		toast.id,
		setTimeout(() => dismissNotificationToast(toast.id), DISPLAY_DURATION_MS)
	);
}
