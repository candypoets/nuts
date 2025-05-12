import { persistentWritable } from 'src/lib/persistentWritable';

export type Key = {
	pub: string;
	npub: string;
	priv?: string;
	nsec?: string;
};

export const key = persistentWritable<Key>('key', {});
