import { derived } from 'svelte/store';
import { isMobile } from 'src/controller';

export const limit = derived(isMobile, ($isMobile) => (isMobile ? 50 : 50));
