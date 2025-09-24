import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { nostrManager } from '@candypoets/nipworker';
import { profileManager } from 'src/controller/managers';
import { get } from 'svelte/store';

export const pathOptions = [
	'receive',
	'send',
	'scan',
	'qr',
	'ecash',
	'followlists',
	'lightning',
	'minting',
	'minted',
	'melt',
	'melted',
	'tapcash',
	'profile',
	'zaps',
	'keys',
	'wallet',
	'post',
	'reply',
	'repost',
	'relays',
	'logout'
];

export function goBack() {
	// Get current path
	const currentPath = get(page).url.pathname;

	const rootPath = currentPath.split('/')[1];

	// Find the last "/" and get everything before it
	const lastSlashIndex = currentPath.lastIndexOf('/');
	nostrManager.cleanup();
	profileManager.cleanup();
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
	const currentPath = get(page).url.pathname;

	// Check if the current URL already ends with the profile we're trying to navigate to
	if (!currentPath.endsWith(eventPath)) {
		setTimeout(() => {
			nostrManager.cleanup();
			profileManager.cleanup();
		}, 300);
		goto(`${currentPath}/${eventPath}`);
	}
}
