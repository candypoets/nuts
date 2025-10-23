import { persistentWritable } from 'src/lib/persistentWritable';

export type Key = {
	pub: string;
	npub: string;
	priv?: string;
	nsec?: string;
};

export const key = persistentWritable<Key>('key', {});

export const walletMnemonic = persistentWritable<string>('wallet/mnemonic', '');
export const walletMnemonicIndex = persistentWritable<number>('wallet/mnemonic_index', 0);
export const walletPassphrase = persistentWritable<string>('wallet/passphrase', '');
