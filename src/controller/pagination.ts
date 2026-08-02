import { derived } from 'svelte/store';
import { isMobile } from 'src/controller';

export const limit = derived(isMobile, ($isMobile) => (isMobile ? 50 : 50));

export const FEED_PAGE_WINDOW_SECONDS = 30 * 24 * 60 * 60;
