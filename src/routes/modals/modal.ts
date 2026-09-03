import { goto, pushState } from '$app/navigation';
import { page } from '$app/stores';
import { getManager } from '@candypoets/nipworker';
import { getContext } from 'svelte';
import { get, writable } from 'svelte/store';
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
	'signup',
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
	'lnurl',
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
	'badge',
	'tapcash',
	'profile',
	'zaps',
	'keys',
	'wallet',
	'lnurl',
	'post',
	'reply',
	'repost',
	'relays',
	// 'relayinfos',
	'logout'
	// 'zoom'
];
const manager = getManager();
export const PAGER_NAVIGATION_CONTEXT = 'pagerNavigation';
export const stackPath = writable(
	typeof window !== 'undefined' ? window.location.pathname : get(page).url.pathname
);
const rootPaths = new Map<string, string>();
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
let lastNavigationRoot: string | undefined;
let navigationRootCleanup: ReturnType<typeof setTimeout> | undefined;

function routeFromEventTarget(target: EventTarget | null) {
	if (typeof Element === 'undefined' || !(target instanceof Element)) return;
	if (target.closest('[data-kind]')) return;
	const routeElement = target.closest<HTMLElement>('[data-carousel-route]');
	const route = routeElement?.dataset.carouselRoute;
	return route && route.startsWith('/') ? route : undefined;
}

function rememberNavigationRoot(route: string | undefined) {
	if (!route) return;
	lastNavigationRoot = route;
	if (navigationRootCleanup) clearTimeout(navigationRootCleanup);
	navigationRootCleanup = setTimeout(() => {
		lastNavigationRoot = undefined;
		navigationRootCleanup = undefined;
	}, 2000);
}

if (typeof document !== 'undefined') {
	window.addEventListener('popstate', () => {
		const path = window.location.pathname;
		rememberRootPath(path);
		stackPath.set(path);
	});

	document.addEventListener(
		'pointerdown',
		(event) => {
			rememberNavigationRoot(routeFromEventTarget(event.target));
		},
		{ capture: true }
	);

	document.addEventListener(
		'click',
		(event) => {
			rememberNavigationRoot(routeFromEventTarget(event.target));
		},
		{ capture: true }
	);
}

function currentPathname() {
	return get(stackPath);
}

function rootPathFromPath(path: string) {
	const root = path.split('/')[1];
	return root ? `/${root}` : undefined;
}

export function rememberRootPath(path: string) {
	const rootPath = rootPathFromPath(path);
	if (!rootPath || !path.startsWith(rootPath)) return;
	rootPaths.set(rootPath, path);
}

export function rememberedRootPath(rootPath: string) {
	return rootPaths.get(rootPath) || rootPath;
}

export function currentNavigationPathname() {
	if (lastNavigationRoot) {
		return lastNavigationRoot;
	}

	return currentPathname();
}

export function clearNavigationRoot() {
	lastNavigationRoot = undefined;
	if (navigationRootCleanup) {
		clearTimeout(navigationRootCleanup);
		navigationRootCleanup = undefined;
	}
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

export function navigateStackPath(path: string) {
	let target = path;
	let pathname = path.split(/[?#]/)[0];

	if (typeof window !== 'undefined') {
		const targetUrl = new URL(path, window.location.href);
		const currentUrl = new URL(window.location.href);
		const targetRoot = targetUrl.pathname.split('/').filter(Boolean)[0];
		const currentRoot = currentUrl.pathname.split('/').filter(Boolean)[0];

		// Stacked screens are encoded in the pathname. Preserve feed-defining
		// query parameters while navigating within the same root section.
		if (!targetUrl.search && targetRoot === currentRoot) {
			targetUrl.search = currentUrl.search;
		}

		target = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
		pathname = targetUrl.pathname;
	}

	rememberRootPath(pathname);
	stackPath.set(pathname);
	try {
		pushState(target, {});
	} catch {
		void goto(target);
	}
}

export type PagerNavigation = {
	rootPath: string;
	push: (eventPath: string) => void;
	root: (eventPath?: string) => void;
	back: () => void;
};

function currentPathForRoot(rootPath: string) {
	const currentPath = currentPathname();
	return currentPath.startsWith(rootPath) ? currentPath : rootPath;
}

export function createPagerNavigation(rootPath: string): PagerNavigation {
	return {
		rootPath,
		push(eventPath: string) {
			if (!eventPath) return;
			const currentPath = currentPathForRoot(rootPath);
			if (!currentPath.endsWith(eventPath)) {
				navigateStackPath(`${currentPath}/${eventPath}`);
				scheduleCleanup();
			}
		},
		root(eventPath?: string) {
			const nextPath = eventPath ? `${rootPath}/${eventPath}` : rootPath;
			navigateStackPath(nextPath);
			scheduleCleanup();
		},
		back() {
			const currentPath = currentPathForRoot(rootPath);
			const lastSlashIndex = currentPath.lastIndexOf('/');
			navigateStackPath(
				lastSlashIndex > rootPath.length ? currentPath.substring(0, lastSlashIndex) : rootPath
			);
			scheduleCleanup();
		}
	};
}

export function usePagerNavigation(): PagerNavigation | undefined {
	return getContext<PagerNavigation | undefined>(PAGER_NAVIGATION_CONTEXT);
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
		navigateStackPath(parentPath);
	} else {
		// If no slash or at root, go to root
		navigateStackPath('/' + rootPath);
	}
	scheduleCleanup();
}

export function goToRoot() {
	// Get current path
	const currentPath = currentPathname();

	// Get the root segment (e.g., /home, /explore, /chat from /home/some/modal)
	const rootPath = currentPath.split('/')[1];
	navigateStackPath('/' + rootPath);
	scheduleCleanup();
}

export function go(eventPath: string) {
	console.log('go', !get(key)?.pub, eventPath);
	const eventKey = eventPath.split(':')[0];
	if (!get(key)?.pub && pathNeedsLogin.includes(eventKey)) {
		console.log('login');
		eventPath = 'login';
	}

	const currentPath = currentNavigationPathname();
	clearNavigationRoot();

	// Check if the current URL already ends with the profile we're trying to navigate to
	if (!currentPath.endsWith(eventPath)) {
		navigateStackPath(`${currentPath}/${eventPath}`);
		scheduleCleanup();
	}
}
