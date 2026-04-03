import {
	Mint,
	Wallet,
	getEncodedToken,
	MintQuoteState,
	type MintQuoteResponse,
	type Proof,
	type Token
} from '@cashu/cashu-ts';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import type { EventTemplate } from 'nostr-tools';
import { derived, get, writable } from 'svelte/store';

import { usePublish } from '@candypoets/nipworker/hooks';
import _, { random } from 'lodash';
import { now } from 'src/lib/period';
import { normalizeMintURL } from 'src/lib/utils';
import { decodePrivKey } from 'src/lib/wallet';
import { go } from 'src/routes/modals/modal';
import type { Mint } from 'src/types/mint';
import { fetchMintData, validateP2pkPubkey } from './wallet';

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
			nutsWallets.set(validateP2pkPubkey(wallet.pubkey), wallet);
			const nuts = get(nutsWallet);
			// Update the most recent wallet if this one is newer
			if (!nuts || createdAt > nuts.createdAt) {
				nutsWallet.set(wallet);
				dispatchAllProofs(nuts || undefined);
			}
			// Verify proofs against mints in background (fire and forget)
			wallet
				.verifyAndCleanProofs()
				.catch((e) => console.error('[wallet] Proof verification failed:', e));
		} catch (error) {
			console.error('Error creating NutsWallet:', error);
			return;
		}
	}
};

export const addProofs = async (mint: string, proofs: Proof[]): Promise<void> => {
	if (!mint || !proofs?.length) return;

	// Filter proofs that have p2pk field in the secret
	const p2pkProofs = proofs.filter((proof) => {
		try {
			const secretObj = JSON.parse(proof.secret);
			if (secretObj.length) {
				return true;
			} else return secretObj.p2pk !== undefined;
		} catch (e) {
			return false;
		}
	});

	// Filter proofs that do not have p2pk field
	const nonP2pkProofs = proofs.filter((proof) => {
		try {
			const secretObj = JSON.parse(proof.secret);
			if (secretObj.length) {
				return false;
			} else return secretObj.p2pk === undefined;
		} catch (e) {
			return true;
		}
	});

	const nuts = get(nutsWallet);

	// Add non-p2pk proofs directly to the most recent wallet
	if (nonP2pkProofs.length > 0 && nuts) {
		nuts.addProofs(mint, nonP2pkProofs);
	}

	if (p2pkProofs.length === 0) return;

	console.log('p2pkProofs', p2pkProofs);

	// Extract unique pubkeys from p2pkProofs
	const pubkeys = [
		...new Set(
			p2pkProofs
				.map((proof) => {
					try {
						const secretObj = JSON.parse(proof.secret);
						return secretObj.p2pk || secretObj[1]?.data;
					} catch (e) {
						return null;
					}
				})
				.filter(Boolean)
		)
	] as string[];

	let undistributedProofs: Proof[] = [];

	// Process p2pk proofs for each relevant wallet
	for (const pubkey of pubkeys) {
		const wallet = getNutsWallet(pubkey);
		if (wallet) {
			const proofsForThisWallet = p2pkProofs.filter((proof) => {
				try {
					const secretObj = JSON.parse(proof.secret);
					const p2pk = secretObj.p2pk || secretObj[1]?.data;
					return p2pk === pubkey;
				} catch (e) {
					return false;
				}
			});
			if (proofsForThisWallet.length > 0) {
				const cashuWallet = await wallet.getWallet(mint);
				try {
					const receivedProofs = await cashuWallet.receive(
						{ mint, proofs: proofsForThisWallet, unit: 'sat' },
						{ privkey: wallet.privkey }
					);
					console.log('success');
					await wallet.saveProofs(mint, receivedProofs);
				} catch (error) {
					console.error('Error receiving proofs:', error);
				}
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
	// Process undistributed proofs with the zero wallet
	if (undistributedProofs.length > 0 && zeroWallet) {
		const cashuWallet = await zeroWallet.getWallet(mint);
		try {
			const receivedProofs = await cashuWallet.receive({ mint, proofs: undistributedProofs });
			await zeroWallet.saveProofs(mint, receivedProofs);
		} catch (error) {
			console.error('Error receiving undistributed proofs:', error);
		}
	}
};

// to be used when receiving a zap

// Function to dispatch all proofs from the zero wallet to their respective wallets
export const dispatchAllProofs = async (previousWallet?: NutsWallet): Promise<void> => {
	if (!nutsWallet) return;

	if (!previousWallet) {
		previousWallet = Array.from(nutsWallets.values()).find((wallet) => wallet.createdAt === 0);
	}
	if (!previousWallet) return;

	// Get all mint URLs from the zero wallet's unspent proofs
	const mintUrls = Array.from(previousWallet.unspentProofs.keys());

	// Call dispatchProofs for each mint URL
	for (const mintUrl of mintUrls) {
		await dispatchProofs(mintUrl, previousWallet);
	}
};

// Function to dispatch proofs from the zero wallet to their respective wallets based on mint URL
export const dispatchProofs = async (
	mintUrl: string,
	previousWallet?: NutsWallet
): Promise<void> => {
	const nuts = get(nutsWallet);
	if (!nuts) return;

	if (!previousWallet) {
		previousWallet = Array.from(nutsWallets.values()).find((wallet) => wallet.createdAt === 0);
	}
	if (!previousWallet) return;

	// Get unspent proofs for the specific mint from the zero wallet
	const unspentProofs = previousWallet.unspentProofs.get(mintUrl) || [];

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
		previousWallet.removeProofs(mintUrl, nonP2pkProofs);
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
				wallet.addProofs(mintUrl, proofsForThisWallet);
				// Remove proofs from zero wallet
				previousWallet.removeProofs(mintUrl, proofsForThisWallet);
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

	public wallets: Map<string, Wallet> = new Map();

	public mints: Mint[] = [];

	// Map to track reserved proofs (in-flight transactions) - persisted to localStorage
	public reservedProofs: Map<string, Proof[]> = new Map();

	// Track active mint quote monitoring loops to prevent duplicates
	private activeMintQuoteMonitors: Set<string> = new Set();

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

		// Load all persisted proofs from localStorage
		this.loadUnspentProofs();
		this.loadSpentProofs();
		this.loadReservedProofs();
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
			const totalAmount = proofs.reduce((sum, proof) => sum + proof.amount, 0);
			// Subtract reserved proofs from available balance
			const reserved = this.reservedProofs.get(mintUrl) || [];
			const reservedAmount = reserved.reduce((sum, proof) => sum + proof.amount, 0);
			newBalanceByMint[mintUrl] = Math.max(0, totalAmount - reservedAmount);
		}

		this.balanceByMint.set(newBalanceByMint);
	};

	public getWallet = async (mintUrl: string): Promise<Wallet> => {
		mintUrl = normalizeMintURL(mintUrl);
		if (!mintUrl) throw new Error('Mint URL is required');

		let wallet = this.wallets.get(mintUrl);
		if (!wallet) {
			const mintInstance = new Mint(mintUrl);
			wallet = new Wallet(mintInstance);
			await wallet.loadMint();
			this.wallets.set(mintUrl, wallet);
		}
		return wallet;
	};

	public addProofs = (mint: string, unspent: Proof[]) => {
		mint = normalizeMintURL(mint);
		if (!mint || !unspent?.length) return;
		const usp = this.unspentProofs.get(mint) || [];

		// Merge and deduplicate proofs (by secret)
		const merged = _.uniqBy([...usp, ...unspent], 'secret');
		this.unspentProofs.set(mint, merged);

		// Persist to localStorage immediately
		this.saveUnspentProofs(mint);

		// Update balance stores
		this.updateBalanceByMint();
	};

	public saveProofs = async (mint: string, proofs: Proof[]) => {
		if (!mint || !proofs?.length) return;

		console.log(`[saveProofs] Saving ${proofs.length} proofs for mint ${mint}`);
		console.log(
			`[saveProofs] Proof amounts:`,
			proofs.map((p) => p.amount)
		);

		// Add proofs to wallet immediately so user sees them
		this.addProofs(mint, proofs);
		console.log(`[saveProofs] Proofs added to wallet`);

		// Backup to Nostr (fire-and-forget, don't block)
		const { publishProofsBackup } = await import('src/model/cashu/tx-recovery');
		publishProofsBackup(mint, proofs)
			.then((ok) => {
				if (ok) {
					console.log(`[saveProofs] Backed up ${proofs.length} proofs to Nostr`);
				} else {
					console.warn(`[saveProofs] Backup publish failed, proofs are still saved locally`);
				}
			})
			.catch((err) => {
				console.error('[saveProofs] Backup error:', err);
			});
	};

	public removeProofs = (mint: string, proofs: Proof[]) => {
		mint = normalizeMintURL(mint);
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

		// Persist to localStorage
		this.saveUnspentProofs(mint);
		this.saveSpentProofs(mint);

		// Update balance stores
		this.updateBalanceByMint();
	};

	/**
	 * Execute a melt (Lightning payment) with automatic post-payment verification
	 * This wraps the wallet's meltProofs and verifies spent proofs with the mint after completion
	 */
	public async meltProofsWithVerification(
		mintUrl: string,
		meltQuote: { quote: string; amount: number; fee_reserve: number; state: string },
		proofsToSend: Proof[]
	): Promise<{ quote: { state: string; payment_preimage?: string }; change: Proof[] }> {
		const wallet = await this.getWallet(mintUrl);

		// DEBUG: Log what we're passing to the library
		const proofsTotal = proofsToSend.reduce((sum, p) => sum + p.amount, 0);
		const requiredAmount = meltQuote.amount + meltQuote.fee_reserve;

		console.log('[meltProofsWithVerification] ========== LIBRARY CALL ==========');
		console.log('[meltProofsWithVerification] mintUrl:', mintUrl);
		console.log('[meltProofsWithVerification] meltQuote.amount:', meltQuote.amount);
		console.log('[meltProofsWithVerification] meltQuote.fee_reserve:', meltQuote.fee_reserve);
		console.log('[meltProofsWithVerification] required (amount + fee_reserve):', requiredAmount);
		console.log('[meltProofsWithVerification] proofsToSend count:', proofsToSend.length);
		console.log('[meltProofsWithVerification] proofsToSend total:', proofsTotal);
		console.log(
			'[meltProofsWithVerification] proofsToSend amounts:',
			proofsToSend.map((p) => p.amount)
		);
		console.log(
			'[meltProofsWithVerification] proofsTotal >= required?',
			proofsTotal >= requiredAmount
		);

		// Execute the melt
		console.log('[meltProofsWithVerification] Calling wallet.meltProofs...');
		const result = await wallet.meltProofs(meltQuote, proofsToSend);
		console.log('[meltProofsWithVerification] meltProofs result:', {
			state: result.quote.state,
			changeCount: result.change?.length,
			changeTotal: result.change?.reduce((sum, p) => sum + p.amount, 0) || 0
		});

		// Update local state: remove spent proofs, save change
		this.removeProofs(mintUrl, proofsToSend);
		if (result.change?.length) {
			this.saveProofs(mintUrl, result.change);
		}
		this.updateBalanceByMint();

		// Verify with mint in background to ensure spent proofs are marked correctly
		this.verifyAndCleanProofs().catch((e) =>
			console.warn('[wallet] Post-melt verification failed:', e)
		);

		return result;
	}

	public monitorMintQuote = async (
		quote: MintQuoteResponse,
		createdAt: number,
		mintUrl: string
	): Promise<void> => {
		const quoteId = quote.quote;

		// Prevent duplicate monitoring loops for the same quote
		if (this.activeMintQuoteMonitors.has(quoteId)) {
			console.log('Already monitoring quote:', quoteId);
			return;
		}
		this.activeMintQuoteMonitors.add(quoteId);

		const wallet = await this.getWallet(mintUrl);
		const quoteExpiry = quote.expiry;
		let interval = 1; // Start with 1 second
		const maxInterval = 30; // Maximum interval of 30 seconds
		let isPaid = false; // Flag to track if the quote has been paid
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			isPaid = true;
			this.activeMintQuoteMonitors.delete(quoteId);
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		};

		const checkQuote = async () => {
			if (isPaid) return; // Stop if already paid
			try {
				const response = await wallet.checkMintQuote(quote.quote);
				if (response.state === MintQuoteState.PAID) {
					isPaid = true; // Set flag to stop further checks
					const proofs = await wallet.mintProofs(quote.amount, quote.quote);
					const mintIndex = this.mintUrls.indexOf(mintUrl);
					const mint = this.mints[mintIndex];
					if (mint) {
						go(`minted:${mint.name}:${quote.amount}`);
					} else {
						go(`minted:${mintUrl}:${quote.amount}`);
					}
					this.deleteMintQuote(createdAt);
					cleanup(); // Remove from active monitors
					const token: Token = { mint: mintUrl, proofs };
					const tokenString = getEncodedToken(token);
					console.log('Cashu token:', tokenString);
					// save proofs in the nostr
					this.saveProofs(mintUrl, proofs);
					// Checkpoint: verify and clean up any spent proofs
					this.verifyAndCleanProofs().catch((e) =>
						console.warn('[wallet] Post-mint verification failed:', e)
					);
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
				cleanup(); // Remove from active monitors
				return;
			}

			// Increase interval over time, up to maxInterval
			const timeSinceCreation = n - createdAt;
			interval = Math.min(1 + Math.floor(timeSinceCreation / 15), maxInterval);

			timeoutId = setTimeout(async () => {
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

	// ===== PERSISTENT PROOF STORAGE =====
	// All proofs are persisted to localStorage for crash recovery

	/**
	 * Save unspent proofs to localStorage
	 */
	private saveUnspentProofs(mint: string): void {
		mint = normalizeMintURL(mint);
		const proofs = this.unspentProofs.get(mint) || [];
		const key = `unspent_${this.pubkey}_${mint}`;
		localStorage.setItem(key, JSON.stringify(proofs));
	}

	/**
	 * Load unspent proofs from localStorage on initialization
	 */
	public loadUnspentProofs(): void {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(`unspent_${this.pubkey}_`)) {
				const mint = key.replace(`unspent_${this.pubkey}_`, '');
				try {
					const stored = localStorage.getItem(key);
					if (stored) {
						const proofs: Proof[] = JSON.parse(stored);
						if (proofs.length > 0) {
							this.unspentProofs.set(mint, proofs);
						}
					}
				} catch (e) {
					console.error(`[wallet] Error loading unspent proofs for ${mint}:`, e);
				}
			}
		}
		this.updateBalanceByMint();
	}

	/**
	 * Verify all unspent proofs against their mints and filter out spent ones
	 * Call this after wallet initialization to clean up spent proofs from localStorage
	 */
	public async verifyAndCleanProofs(): Promise<void> {
		// console.log('[wallet] Verifying proofs against mints...');

		for (const [mint, proofs] of this.unspentProofs.entries()) {
			if (proofs.length === 0) continue;

			try {
				const validProofs = await this.checkAndFilterProofs(mint, proofs);

				if (validProofs.length < proofs.length) {
					const removed = proofs.length - validProofs.length;
					this.unspentProofs.set(mint, validProofs);
					this.saveUnspentProofs(mint);
				}
			} catch (e) {
				console.error(`[wallet] Error verifying proofs for ${mint}:`, e);
			}
		}

		this.updateBalanceByMint();
		// console.log('[wallet] Proof verification complete');
	}

	/**
	 * Save spent proofs to localStorage
	 */
	private saveSpentProofs(mint: string): void {
		mint = normalizeMintURL(mint);
		const proofs = this.spentProofs.get(mint) || [];
		const key = `spent_${this.pubkey}_${mint}`;
		localStorage.setItem(key, JSON.stringify(proofs));
	}

	/**
	 * Load spent proofs from localStorage on initialization
	 */
	public loadSpentProofs(): void {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(`spent_${this.pubkey}_`)) {
				const mint = key.replace(`spent_${this.pubkey}_`, '');
				try {
					const stored = localStorage.getItem(key);
					if (stored) {
						const proofs: Proof[] = JSON.parse(stored);
						if (proofs.length > 0) {
							this.spentProofs.set(mint, proofs);
						}
					}
				} catch (e) {
					console.error(`[wallet] Error loading spent proofs for ${mint}:`, e);
				}
			}
		}
	}

	// ===== PROOF RESERVATION METHODS =====
	// These methods manage proof reservations for in-flight transactions

	/**
	 * Get the localStorage key for reserved proofs for this wallet and mint
	 */
	private getReservedProofsKey(mint: string): string {
		return `reserved_${this.pubkey}_${normalizeMintURL(mint)}`;
	}

	/**
	 * Persist reserved proofs to localStorage
	 */
	private saveReservedProofs(mint: string): void {
		const reserved = this.reservedProofs.get(normalizeMintURL(mint)) || [];
		const key = this.getReservedProofsKey(mint);
		localStorage.setItem(key, JSON.stringify(reserved));
	}

	/**
	 * Load reserved proofs from localStorage on initialization
	 */
	public loadReservedProofs(): void {
		// Find all localStorage keys matching our pattern
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(`reserved_${this.pubkey}_`)) {
				const mint = key.replace(`reserved_${this.pubkey}_`, '');
				try {
					const stored = localStorage.getItem(key);
					if (stored) {
						const proofs: Proof[] = JSON.parse(stored);
						if (proofs.length > 0) {
							this.reservedProofs.set(mint, proofs);
							console.log(`Loaded ${proofs.length} reserved proofs for ${mint}`);
						}
					}
				} catch (e) {
					console.error(`Error loading reserved proofs for ${mint}:`, e);
				}
			}
		}
		// Update balance to exclude reserved proofs
		this.updateBalanceByMint();
	}

	/**
	 * Reserve proofs for a transaction - moves them from unspent to reserved
	 * This prevents double-spend during crashes and recovery
	 * @returns true if reservation succeeded, false if proofs not available
	 */
	public reserveProofs(mint: string, proofs: Proof[]): boolean {
		mint = normalizeMintURL(mint);
		if (!mint || !proofs?.length) return false;

		const unspent = this.unspentProofs.get(mint) || [];
		const currentlyReserved = this.reservedProofs.get(mint) || [];

		// Verify all proofs exist in unspent
		const proofsToReserve: Proof[] = [];
		for (const proof of proofs) {
			const exists = unspent.some((p) => p.secret === proof.secret);
			if (!exists) {
				console.warn(
					'Cannot reserve proof - not found in unspent:',
					proof.secret.slice(0, 16) + '...'
				);
				return false;
			}
			// Avoid duplicates
			if (!currentlyReserved.some((p) => p.secret === proof.secret)) {
				proofsToReserve.push(proof);
			}
		}

		if (proofsToReserve.length === 0) {
			// All proofs already reserved
			return true;
		}

		// Move proofs from unspent to reserved
		const updatedReserved = [...currentlyReserved, ...proofsToReserve];
		this.reservedProofs.set(mint, updatedReserved);

		// Persist to localStorage
		this.saveReservedProofs(mint);

		// Update balance stores
		this.updateBalanceByMint();

		console.log(`Reserved ${proofsToReserve.length} proofs for ${mint}`);
		return true;
	}

	/**
	 * Release reserved proofs back to unspent - called when transaction is aborted
	 */
	public releaseReserved(mint: string, proofs: Proof[]): void {
		mint = normalizeMintURL(mint);
		if (!mint || !proofs?.length) return;

		const reserved = this.reservedProofs.get(mint) || [];
		if (reserved.length === 0) return;

		// Find proofs to release
		const secretsToRelease = new Set(proofs.map((p) => p.secret));
		const updatedReserved = reserved.filter((p) => !secretsToRelease.has(p.secret));
		const releasedCount = reserved.length - updatedReserved.length;

		if (releasedCount === 0) return;

		if (updatedReserved.length === 0) {
			this.reservedProofs.delete(mint);
		} else {
			this.reservedProofs.set(mint, updatedReserved);
		}

		// Persist to localStorage
		this.saveReservedProofs(mint);

		// Update balance stores
		this.updateBalanceByMint();

		console.log(`Released ${releasedCount} reserved proofs for ${mint}`);
	}

	/**
	 * Commit reserved proofs to spent - called when transaction completes successfully
	 */
	public commitReserved(mint: string, proofs: Proof[]): void {
		mint = normalizeMintURL(mint);
		if (!mint || !proofs?.length) return;

		const reserved = this.reservedProofs.get(mint) || [];
		if (reserved.length === 0) return;

		// Find proofs to commit
		const secretsToCommit = new Set(proofs.map((p) => p.secret));
		const updatedReserved = reserved.filter((p) => !secretsToCommit.has(p.secret));
		const committedProofs = reserved.filter((p) => secretsToCommit.has(p.secret));
		const committedCount = committedProofs.length;

		if (committedCount === 0) return;

		// Remove from reserved
		if (updatedReserved.length === 0) {
			this.reservedProofs.delete(mint);
		} else {
			this.reservedProofs.set(mint, updatedReserved);
		}

		// Persist updated reserved to localStorage
		this.saveReservedProofs(mint);

		// Move committed proofs from unspent to spent
		this.removeProofs(mint, committedProofs);

		console.log(`Committed ${committedCount} reserved proofs for ${mint}`);
	}

	/**
	 * Get all reserved proofs across all mints
	 */
	public getAllReservedProofs(): Array<{ mint: string; proofs: Proof[] }> {
		const result: Array<{ mint: string; proofs: Proof[] }> = [];
		for (const [mint, proofs] of this.reservedProofs.entries()) {
			if (proofs.length > 0) {
				result.push({ mint, proofs });
			}
		}
		return result;
	}

	/**
	 * Check proofs against mint and return only unspent ones
	 * Use this to recover from "token already spent" errors
	 */
	public async checkAndFilterProofs(mintUrl: string, proofs: Proof[]): Promise<Proof[]> {
		if (!proofs.length) return proofs;

		try {
			const wallet = await this.getWallet(mintUrl);
			const secrets = proofs.map((p) => ({ secret: p.secret }));
			const states = await wallet.checkProofsStates(secrets);

			const unspentProofs: Proof[] = [];
			const spentSecrets: string[] = [];

			for (let i = 0; i < states.length; i++) {
				const state = states[i];
				// CheckStateEnum: UNSPENT, PENDING, SPENT
				const stateValue = state.state as any;
				if (stateValue === 'UNSPENT' || stateValue === 'PENDING') {
					unspentProofs.push(proofs[i]);
				} else {
					spentSecrets.push(proofs[i].secret);
				}
			}

			if (spentSecrets.length > 0) {
				console.log(
					`[wallet] Found ${spentSecrets.length} spent proofs for ${mintUrl}, filtering out`
				);
			}

			return unspentProofs;
		} catch (e) {
			console.error('[wallet] Error checking proofs:', e);
			// Return original proofs if check fails
			return proofs;
		}
	}
}
