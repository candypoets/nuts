import { createNostrManager, nostrManager } from '@candypoets/nipworker';

export const chatManager = createNostrManager({ bufferKey: 'chat', maxBufferSize: 100_000_000 });
export const cashuManager = createNostrManager({ bufferKey: 'cashu', maxBufferSize: 100_000_000 });
export const profileManager = createNostrManager({
	bufferKey: 'profiles',
	maxBufferSize: 100_000_000
});

export const setSigner = (kind: string, key: string) => {
	chatManager.setSigner(kind, key);
	nostrManager.setSigner(kind, key);
	cashuManager.setSigner(kind, key);
	profileManager.setSigner(kind, key);
};
