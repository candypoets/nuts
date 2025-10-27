import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { nipWorker } from '@candypoets/nipworker';
import { get } from 'svelte/store';
import { key } from 'src/controller';

export const pathOptions = [
	'receive',
	'send',
	'scan',
	'qr',
	'ecash',
	'followlists',
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
	'share',
	'logout',
	'zoom'
];

export const pathNeedsLogin = [
	'receive',
	'send',
	// 'scan',
	// 'qr',
	'ecash',
	'followlists',
	'lightning',
	// 'login',
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
	// 'relayinfos',
	'share',
	'logout'
	// 'zoom'
];

export function goBack() {
	// Get current path
	const currentPath = get(page).url.pathname;

	const rootPath = currentPath.split('/')[1];

	// Find the last "/" and get everything before it
	const lastSlashIndex = currentPath.lastIndexOf('/');
	nipWorker.cleanup();
	if (lastSlashIndex > 0) {
		// Navigate to the parent path (everything before last slash)
		const parentPath = currentPath.substring(0, lastSlashIndex);
		goto(parentPath);
	} else {
		// If no slash or at root, go to root
		goto(rootPath);
	}
}

export function go(eventPath: string) {
	console.log('go', !get(key)?.pub, eventPath);
	if (!get(key)?.pub && pathNeedsLogin.some((p) => eventPath.includes(p))) {
		console.log('login');
		eventPath = 'login';
	}

	const currentPath = get(page).url.pathname;

	// Check if the current URL already ends with the profile we're trying to navigate to
	if (!currentPath.endsWith(eventPath)) {
		setTimeout(() => {
			nipWorker.cleanup();
		}, 300);
		goto(`${currentPath}/${eventPath}`);
	}
}
