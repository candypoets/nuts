import { createNostrManager, nostrManager } from '@candypoets/nipworker';

export const chatManager = createNostrManager();
export const cashuManager = createNostrManager();

export const setSigner = (kind: string, key: string) => {
	chatManager.setSigner(kind, key);
	nostrManager.setSigner(kind, key);
	cashuManager.setSigner(kind, key);
};
