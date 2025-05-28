import { derived, writable } from 'svelte/store';

export const dimensions = writable({ width: 0, height: 0 });

export const viewport = derived(dimensions, ($dimensions) => ({
	vw: $dimensions.width * 0.01,
	vh: $dimensions.height * 0.01
}));

export const isMobile = derived(dimensions, ($dimensions) => $dimensions.width <= 768);
