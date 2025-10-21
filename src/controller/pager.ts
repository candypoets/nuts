import { derived, writable, type Readable } from 'svelte/store';
import { page } from '$app/stores';
import { PagerAnimator } from 'src/lib/animations/PagerAnimator.js';

// Store for the pager animators keyset
export const pagerAnimators = writable<Record<string, PagerAnimator>>({});

// Default animation configuration
const DEFAULT_ANIMATION_CONFIG = {
	duration: 0.2,
	in: {
		sub: {
			x: ['100%', '0%'],
			y: [0, 0],
			scale: [1, 1],
			opacity: [0.5, 1]
		},
		modal: {
			x: [0, 0],
			y: ['100%', '0%'],
			scale: [1, 1],
			opacity: [0.5, 1]
		}
	},
	out: {
		sub: {
			x: '100%',
			opacity: 0.3
		},
		modal: {
			y: '100%',
			opacity: 0.5
		}
	}
};

/**
 * Derived store that selects the correct PagerAnimator instance based on the current URL path
 */
export const pagerAnimator: Readable<PagerAnimator | null> = derived(
	[page, pagerAnimators],
	([$page, $pagerAnimators]) => {
		// Extract the base path from the current URL
		const basePath = getBasePath($page.url.pathname);

		// Return the corresponding PagerAnimator instance or null if not found
		return $pagerAnimators[basePath] || null;
	}
);

/**
 * Set up pager animators for different routes
 */
export function setupPagerAnimators(
	viewport: { vw: number; vh: number },
	goBackRouter: () => void
) {
	const animators = {
		home: new PagerAnimator(viewport, goBackRouter, DEFAULT_ANIMATION_CONFIG),
		explore: new PagerAnimator(viewport, goBackRouter, DEFAULT_ANIMATION_CONFIG),
		chat: new PagerAnimator(viewport, goBackRouter, DEFAULT_ANIMATION_CONFIG)
	};

	// Update the pager animators store
	pagerAnimators.set(animators);
}

/**
 * Update viewport for all pager animators
 */
export function updatePagerAnimatorsViewport(viewport: { vw: number; vh: number }) {
	pagerAnimators.update((animators) => {
		Object.values(animators).forEach((animator) => {
			animator.updateViewport(viewport);
		});
		return animators;
	});
}

/**
 * Extract base path from a full pathname
 * Examples:
 * - "/home/profile" -> "home"
 * - "/explore/search" -> "explore"
 * - "/chat/dm/123" -> "chat"
 */
function getBasePath(pathname: string): string {
	const segments = pathname.split('/').filter(Boolean);
	return segments[0] || 'home'; // Default to 'home' if no segments
}

/**
 * Get the current pager animator based on the current page
 */
export function getCurrentPagerAnimator(): PagerAnimator | null {
	let currentAnimator: PagerAnimator | null = null;

	// Subscribe to get the current value
	const unsubscribe = pagerAnimator.subscribe((value) => {
		currentAnimator = value;
	});

	// Immediately unsubscribe since we only need the current value
	unsubscribe();

	return currentAnimator;
}
