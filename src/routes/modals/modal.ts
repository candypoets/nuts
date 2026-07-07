import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { getManager } from '@candypoets/nipworker';
import { get } from 'svelte/store';
import { key } from 'src/controller';

export const pathOptions = [
	'receive',
	'send',
	'scan',
	'qr',
	'ecash',
	'cmdk',
	'kind0',
	'kind1111',
	'lightning',
	'login',
	'minting',
	'minted',
	'melt',
	'melted',
	'newchat',
	'tapcash',
	'profile',
	'zaps',
	'keys',
	'wallet',
	'post',
	'reply',
	'repost',
	'relays',
	'relayinfos',
	'event',
	'share',
	'logout',
	'theme',
	'zoom'
];

export const pathNeedsLogin = [
	'receive',
	'send',
	// 'scan',
	// 'qr',
	'ecash',
	'lightning',
	'kind0',
	// 'login',
	'minting',
	'minted',
	'melt',
	'melted',
	'newchat',
	'notifications',
	'tapcash',
	'profile',
	'zaps',
	'keys',
	'wallet',
	'post',
	'reply',
	'repost',
	'relays',
	// 'relayinfos',
	'share',
	'logout'
	// 'zoom'
];
const manager = getManager();
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

function currentPathname() {
	if (typeof window !== 'undefined') return window.location.pathname;
	return get(page).url.pathname;
}

function scheduleCleanup(delay = 1000) {
	if (cleanupTimer) clearTimeout(cleanupTimer);

	cleanupTimer = setTimeout(() => {
		cleanupTimer = undefined;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				manager.cleanup();
			});
		});
	}, delay);
}

export function goBack() {
	// Get current path
	const currentPath = currentPathname();

	const rootPath = currentPath.split('/')[1];

	// Find the last "/" and get everything before it
	const lastSlashIndex = currentPath.lastIndexOf('/');
	if (lastSlashIndex > 0) {
		// Navigate to the parent path (everything before last slash)
		const parentPath = currentPath.substring(0, lastSlashIndex);
		goto(parentPath);
	} else {
		// If no slash or at root, go to root
		goto(rootPath);
	}
	scheduleCleanup();
}

export function goToRoot() {
	// Get current path
	const currentPath = currentPathname();

	// Get the root segment (e.g., /home, /explore, /chat from /home/some/modal)
	const rootPath = currentPath.split('/')[1];
	goto('/' + rootPath);
	scheduleCleanup();
}

export function go(eventPath: string) {
	console.log('go', !get(key)?.pub, eventPath);
	const eventKey = eventPath.split(':')[0];
	if (!get(key)?.pub && pathNeedsLogin.includes(eventKey)) {
		console.log('login');
		eventPath = 'login';
	}

	const currentPath = currentPathname();

	// Check if the current URL already ends with the profile we're trying to navigate to
	if (!currentPath.endsWith(eventPath)) {
		goto(`${currentPath}/${eventPath}`);
		scheduleCleanup();
	}
}
