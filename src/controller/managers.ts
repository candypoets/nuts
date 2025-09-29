import { createNostrManager, nostrManager } from '@candypoets/nipworker';
import { get } from 'svelte/store';
import { isMobile } from './viewport';

// export const chatManager = get(isMobile)
// 	? nostrManager
// 	: createNostrManager({ bufferKey: 'chat', maxBufferSize: 5_000_000 });
export const chatManager = nostrManager;
export const cashuManager = nostrManager;
export const profileManager = nostrManager;
// export const profileManager = createNostrManager({
// 	bufferKey: 'profiles',
// 	maxBufferSize: 5_000_000
// });

export const setSigner = (kind: string, key: string) => {
	// chatManager.setSigner(kind, key);
	nostrManager.setSigner(kind, key);
	// cashuManager.setSigner(kind, key);
	// profileManager.setSigner(kind, key);
};
