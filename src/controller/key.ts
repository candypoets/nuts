import { persistentWritable } from 'src/lib/persistentWritable';

export type Key = {
	pub: string;
	npub: string;
	priv?: string;
	nsec?: string;
	hasSigner?: boolean;
};

export const key = persistentWritable<Key>('key', { pub: '', npub: '' });

export const walletMnemonic = persistentWritable<string>('wallet/mnemonic', '');
export const walletMnemonicIndex = persistentWritable<number>('wallet/mnemonic_index', 0);
export const walletPassphrase = persistentWritable<string>('wallet/passphrase', '');
