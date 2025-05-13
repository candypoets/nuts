export * from './parseContent';

export const nutKinds = {
	Nutzap: 9321,
	NutzapRedeemed: 7376,
	NutzapInfo: 10019
};

import { writable } from 'svelte/store';

export const viewport = writable({ vw: 0, vh: 0 });

export function formatDate(date: Date) {
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const dateToFormat = new Date(date);
	const isToday = dateToFormat.toDateString() === today.toDateString();
	const isYesterday = dateToFormat.toDateString() === yesterday.toDateString();

	if (isToday) {
		return 'Today';
	} else if (isYesterday) {
		return 'Yesterday';
	} else {
		return dateToFormat.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
}

export function removeTrailingSlash(url: string): string {
	if (url.endsWith('/')) {
		return url.slice(0, -1);
	}
	return url;
}
