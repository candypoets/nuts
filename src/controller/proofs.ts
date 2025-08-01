import { nostrManager } from '@candypoets/nipworker';
import {
	CashuMint,
	CashuWallet,
	CheckStateEnum,
	MintQuoteState,
	type MintQuoteResponse,
	type Proof
} from '@cashu/cashu-ts';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import type { EventTemplate } from 'nostr-tools';
import { derived, get, writable } from 'svelte/store';

import _, { random } from 'lodash';
import { now } from 'src/lib/period';
import { decodePrivKey } from 'src/lib/wallet';
import { go } from 'src/routes/modals/modal';
import type { Mint } from 'src/types/mint';
import { fetchMintData } from './wallet';
import { normalizeMintURL } from 'src/lib/utils';

export type MintQuote = MintQuoteResponse & {
	mintUrl: string;
};

// Map to store all NutsWallet instances keyed by their public key
export const nutsWallets: Map<string, NutsWallet> = new Map();

// Function to retrieve a NutsWallet instance by public key
export const getNutsWallet = (pubkey: string): NutsWallet | undefined => {
	return nutsWallets.get(pubkey);
};

// Variable to hold the most recent NutsWallet instance

export const nutsWallet = writable<NutsWallet | null>(null);

// Function to set a NutsWallet instance in the map and update the most recent wallet
export const setNutsWallet = (
	privkey: string,
	pubkey: string = '',
	mints: string[] = [],
	createdAt: number = 0
): void => {
	// Only set the wallet if it doesn't already exist in the map
	if (!nutsWallets.has(pubkey)) {
		try {
			const wallet = new NutsWallet(privkey, pubkey, mints, createdAt);
			nutsWallets.set(wallet.pubkey, wallet);
			const nuts = get(nutsWallet);
			// Update the most recent wallet if this one is newer
			if (!nuts || createdAt > nuts.createdAt) {
				nutsWallet.set(wallet);
			}
		} catch (error) {
			console.error('Error creating NutsWallet:', error);
			return;
		}
	}
};

export const addProofs = async (mint: string, proofs: Proof[]): Promise<void> => {
	if (!mint || !proofs?.length) return;

	// Filter proofs that have p2pk field in the secret and extract pubkeys
	const p2pkProofs = proofs.filter((proof) => {
		try {
			const secretObj = JSON.parse(proof.secret);
			console.log(mint, secretObj);
			return secretObj.p2pk !== undefined;
		} catch (e) {
			// If secret is not a valid JSON, it doesn't have p2pk field
			return false;
		}
	});

	// Filter proofs that do not have p2pk field
	const nonP2pkProofs = proofs.filter((proof) => {
		try {
			const secretObj = JSON.parse(proof.secret);
			return secretObj.p2pk === undefined;
		} catch (e) {
			// If secret is not a valid JSON, it doesn't have p2pk field
			return true;
		}
	});

	const nuts = get(nutsWallet);

	// Add non-p2pk proofs to the most recent wallet
	if (nonP2pkProofs.length > 0 && nuts) {
		await nuts.addProofs(mint, nonP2pkProofs);
	}

	if (p2pkProofs.length === 0) return;

	// Extract unique pubkeys from p2pkProofs
	const pubkeys = [
		...new Set(
			p2pkProofs
				.map((proof) => {
					try {
						const secretObj = JSON.parse(proof.secret);
						return secretObj.p2pk;
					} catch (e) {
						return null;
					}
				})
				.filter(Boolean)
		)
	] as string[];

	let undistributedProofs: Proof[] = [];

	// Add proofs to each relevant wallet
	for (const pubkey of pubkeys) {
		const wallet = getNutsWallet(pubkey);
		if (wallet) {
			const proofsForThisWallet = p2pkProofs.filter((proof) => {
				try {
					const secretObj = JSON.parse(proof.secret);
					return secretObj.p2pk === pubkey;
				} catch (e) {
					return false;
				}
			});
			if (proofsForThisWallet.length > 0) {
				await wallet.addProofs(mint, proofsForThisWallet);
			}
		} else {
			// Collect proofs that couldn't be distributed
			const proofsForThisPubkey = p2pkProofs.filter((proof) => {
				try {
					const secretObj = JSON.parse(proof.secret);
					return secretObj.p2pk === pubkey;
				} catch (e) {
					return false;
				}
			});
			undistributedProofs = [...undistributedProofs, ...proofsForThisPubkey];
		}
	}
	// Find the zero wallet (created at 0)
	const zeroWallet = Array.from(nutsWallets.values()).find((wallet) => wallet.createdAt === 0);
	// Add undistributed proofs to the "0" wallet
	if (undistributedProofs.length > 0 && zeroWallet) {
		await zeroWallet.addProofs(mint, undistributedProofs);
	}
};

// Function to dispatch all proofs from the zero wallet to their respective wallets
export const dispatchAllProofs = async (): Promise<void> => {
	if (!nutsWallet) return;

	const zeroWallet = Array.from(nutsWallets.values()).find((wallet) => wallet.createdAt === 0);
	if (!zeroWallet) return;

	// Get all mint URLs from the zero wallet's unspent proofs
	const mintUrls = Array.from(zeroWallet.unspentProofs.keys());

	// Call dispatchProofs for each mint URL
	for (const mintUrl of mintUrls) {
		await dispatchProofs(mintUrl);
	}
};

// Function to dispatch proofs from the zero wallet to their respective wallets based on mint URL
export const dispatchProofs = async (mintUrl: string): Promise<void> => {
	const nuts = get(nutsWallet);
	if (!nuts) return;

	const zeroWallet = Array.from(nutsWallets.values()).find((wallet) => wallet.createdAt === 0);
	if (!zeroWallet) return;

	// Get unspent proofs for the specific mint from the zero wallet
	const unspentProofs = zeroWallet.unspentProofs.get(mintUrl) || [];

	// Filter proofs that have p2pk field in the secret
	const p2pkProofs = unspentProofs.filter((proof) => {
		try {
			const secretObj = JSON.parse(proof.secret);
			return secretObj.p2pk !== undefined;
		} catch (e) {
			return false;
		}
	});

	// Filter proofs that do not have p2pk field
	const nonP2pkProofs = unspentProofs.filter((proof) => {
		try {
			const secretObj = JSON.parse(proof.secret);
			return secretObj.p2pk === undefined;
		} catch (e) {
			// If secret is not a valid JSON, it doesn't have p2pk field
			return true;
		}
	});

	// Dispatch non-p2pk proofs to the most recent wallet
	if (nonP2pkProofs.length > 0 && nuts) {
		nuts.addProofs(mintUrl, nonP2pkProofs);
		// Remove proofs from zero wallet
		await zeroWallet.removeProofs(mintUrl, nonP2pkProofs);
	}

	if (p2pkProofs.length === 0) return;

	// Extract unique pubkeys from p2pkProofs
	const pubkeys = [
		...new Set(
			p2pkProofs
				.map((proof) => {
					try {
						const secretObj = JSON.parse(proof.secret);
						return secretObj.p2pk;
					} catch (e) {
						return null;
					}
				})
				.filter(Boolean)
		)
	] as string[];

	// Dispatch p2pk proofs to each relevant wallet
	for (const pubkey of pubkeys) {
		const wallet = getNutsWallet(pubkey);
		if (wallet) {
			const proofsForThisWallet = p2pkProofs.filter((proof) => {
				try {
					const secretObj = JSON.parse(proof.secret);
					return secretObj.p2pk === pubkey;
				} catch (e) {
					return false;
				}
			});
			if (proofsForThisWallet.length > 0) {
				await wallet.addProofs(mintUrl, proofsForThisWallet);
				// Remove proofs from zero wallet
				await zeroWallet.removeProofs(mintUrl, proofsForThisWallet);
			}
		}
	}
};

/**
 * NutsWallet class manages Cashu tokens and proofs for a specific public key.
 * It handles multiple mints, tracks unspent and spent proofs, and provides
 * balance tracking through Svelte stores.
 */
export class NutsWallet {
	// Maps to track proofs by mint url - unspent proofs are available for spending, spent proofs are historical
	public unspentProofs: Map<string, Proof[]> = new Map();
	public spentProofs: Map<string, Proof[]> = new Map();

	public wallets: Map<string, CashuWallet> = new Map();

	public mints: Mint[] = [];

	private _pubkey: string;
	private _privkey: string;

	// Svelte stores for balance tracking
	public balanceByMint = writable<Record<string, number>>({});

	public balance = derived(this.balanceByMint, ($balanceByMint) => {
		return Object.values($balanceByMint).reduce((total, amount) => total + amount, 0);
	});

	constructor(
		privateKey: string,
		publickey: string = '',
		public readonly mintUrls: string[] = [],
		public readonly createdAt: number = 0
	) {
		// Check if the "0" wallet already exists
		if (
			createdAt === 0 &&
			Array.from(nutsWallets.values()).some((wallet) => wallet.createdAt === 0)
		) {
			throw new Error('A "0" wallet already exists');
		}

		this.mintUrls = this.mintUrls.map(normalizeMintURL);

		this._privkey = privateKey;
		if (privateKey && !publickey) {
			this._pubkey = this.derivePubkeyFromPrivate(privateKey);
		} else if (publickey) {
			this._pubkey = publickey;
		} else {
			throw new Error('Either privateKey or publickey must be provided');
		}

		Promise.all(mintUrls.map(fetchMintData)).then((res) => (this.mints = res));

		this.loadAndMonitorMintQuotes();
	}

	public get pubkey(): string {
		return this._pubkey;
	}

	public get privkey(): string {
		return this._privkey;
	}

	private derivePubkeyFromPrivate(privateKey: string): string {
		const pk = decodePrivKey(privateKey);
		const pubkey = bytesToHex(schnorr.getPublicKey(pk));
		return pubkey;
	}

	public updateBalanceByMint = () => {
		const newBalanceByMint: Record<string, number> = {};

		for (const [mintUrl, proofs] of this.unspentProofs.entries()) {
			console.log(
				'Proofs uniqueness check:',
				proofs.length === _.uniqBy(proofs, 'secret').length
					? 'All proofs are unique'
					: 'Duplicate proofs found'
			);

			const totalAmount = proofs.reduce((sum, proof) => sum + proof.amount, 0);
			newBalanceByMint[mintUrl] = totalAmount;
		}

		this.balanceByMint.set(newBalanceByMint);
	};

	public getWallet = async (mintUrl: string): Promise<CashuWallet> => {
		mintUrl = normalizeMintURL(mintUrl);
		if (!mintUrl) throw new Error('Mint URL is required');

		let wallet = this.wallets.get(mintUrl);
		if (!wallet) {
			const mintInstance = new CashuMint(mintUrl);
			wallet = new CashuWallet(mintInstance);
			console.log('fetching keysets for ', mintUrl);
			await wallet.loadMint();
			this.wallets.set(mintUrl, wallet);
		}
		return wallet;
	};

	public addProofs = (mint: string, unspent: Proof[]) => {
		mint = normalizeMintURL(mint);
		if (!mint || !unspent?.length) return;
		const usp = this.unspentProofs.get(mint) || [];

		console.log(
			'addProofs usp',
			mint,
			usp.reduce((acc, cur) => acc + cur.amount, 0)
		);

		this.unspentProofs.set(mint, _.uniqBy([...usp, ...unspent], 'secret'));

		// Update balance stores
		this.updateBalanceByMint();
	};

	public saveProofs = async (mint: string, proofs: Proof[]) => {
		if (!mint || !proofs?.length) return;

		const usp = this.unspentProofs.get(mint) || [];
		const allUnspentProofs = [...usp, ...proofs];

		console.log(allUnspentProofs);

		const event: EventTemplate = {
			kind: 7375,
			content: JSON.stringify({
				mint,
				proofs: allUnspentProofs,
				del: []
			}),
			tags: [],
			created_at: now()
		};

		nostrManager.publish('savenuts' + random(1000), event);

		this.addProofs(mint, proofs);
	};

	public removeProofs = (mint: string, proofs: Proof[]) => {
		if (!mint || !proofs?.length) return;

		const usp = this.unspentProofs.get(mint) || [];
		const sp = this.spentProofs.get(mint) || [];

		// Find proofs to remove from unspent (based on secret)
		const proofsToRemove = proofs.filter((proof) =>
			usp.some((unspentProof) => unspentProof.secret === proof.secret)
		);

		if (!proofsToRemove.length) return;

		// Remove from unspent
		const updatedUnspent = usp.filter(
			(unspentProof) => !proofsToRemove.some((proof) => proof.secret === unspentProof.secret)
		);

		// Add to spent
		const updatedSpent = [...sp, ...proofsToRemove];

		// Update maps
		this.unspentProofs.set(mint, updatedUnspent);
		this.spentProofs.set(mint, updatedSpent);

		// Update balance stores
		this.updateBalanceByMint();
	};

	public monitorMintQuote = async (
		quote: MintQuoteResponse,
		createdAt: number,
		mintUrl: string
	): Promise<void> => {
		const wallet = await this.getWallet(mintUrl);
		const quoteExpiry = quote.expiry;
		let interval = 1; // Start with 1 second
		const maxInterval = 30; // Maximum interval of 30 seconds
		let isPaid = false; // Flag to track if the quote has been paid

		const checkQuote = async () => {
			if (isPaid) return; // Stop if already paid
			try {
				const response = await wallet.checkMintQuote(quote.quote);
				if (response.state === MintQuoteState.PAID) {
					isPaid = true; // Set flag to stop further checks
					console.log('Quote has been paid:', quote.quote);
					const proofs = await wallet.mintProofs(quote.amount, quote.quote);
					const mintIndex = this.mintUrls.indexOf(mintUrl);
					const mint = this.mints[mintIndex];
					if (mint) {
						go(`minted:${mint.name}:${quote.amount}`);
					} else {
						go(`minted:${mintUrl}:${quote.amount}`);
					}
					this.deleteMintQuote(createdAt);
					// save proofs in the nostr
					this.saveProofs(mintUrl, proofs);
				}
			} catch (error) {
				console.error('Error checking mint quote:', error);
			}
		};

		const scheduleNextCheck = () => {
			if (isPaid) return; // Stop scheduling if already paid
			const n = now();
			const timeUntilExpiry = quoteExpiry - n;

			if (timeUntilExpiry <= 0) {
				console.log('Quote expired:', quote.quote);
				return;
			}

			// Increase interval over time, up to maxInterval
			const timeSinceCreation = n - createdAt;
			interval = Math.min(1 + Math.floor(timeSinceCreation / 15), maxInterval);

			setTimeout(async () => {
				await checkQuote();
				if (!isPaid) {
					scheduleNextCheck();
				}
			}, interval * 1000);
		};

		scheduleNextCheck();
	};

	public saveMintQuote = (createdAt: number, quote: MintQuoteResponse, mintUrl: string): void => {
		const quotes = JSON.parse(localStorage.getItem('quotes_' + this.pubkey) || '{}');
		quotes[createdAt] = {
			...quote,
			mintUrl
		};
		localStorage.setItem('quotes_' + this.pubkey, JSON.stringify(quotes));
	};

	public deleteMintQuote = (createdAt: number): void => {
		const quotes = JSON.parse(localStorage.getItem('quotes_' + this.pubkey) || '{}');
		if (quotes[createdAt]) {
			delete quotes[createdAt];
			localStorage.setItem('quotes_' + this.pubkey, JSON.stringify(quotes));
		}
	};

	public loadAndMonitorMintQuotes = async (): Promise<void> => {
		const quotes = JSON.parse(localStorage.getItem('quotes_' + this.pubkey) || '{}');

		for (const [createdAtStr, quote] of Object.entries(quotes)) {
			const createdAt = parseInt(createdAtStr);
			const mintQuote = quote as MintQuoteResponse & { mintUrl: string };

			if (mintQuote.expiry < now()) {
				console.log('Deleting expired quote:', mintQuote.quote);
				this.deleteMintQuote(createdAt);
			} else {
				console.log('Monitoring quote:', mintQuote.quote);
				this.monitorMintQuote(mintQuote, createdAt, mintQuote.mintUrl);
			}
		}
	};
}
