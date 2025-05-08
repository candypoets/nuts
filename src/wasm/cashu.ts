import type { ProofUnion } from 'src/parsers';
import NostrWorker from 'src/wasm/nostr?worker';

export type WalletBalance = {
	total: number;
	byMint: Record<string, number>;
};

export type TokenData = {
	token: string;
	amount?: number; // Amount in sats
	mintURL?: string;
};

export type MintQuote = {
	id: string;
	amount: number;
	request: string;
	paid: boolean;
	created: number;
	mint: string;
	// Other fields as needed
};

export type MeltQuote = {
	quote: string;
	request: string;
	amount: number;
	unit: string;
	feeReserve: number;
	state: State;
	expiry: number;
	preimage?: string;
	change?: BlindedSignatures;
};

// We need to reference these types but they're not defined in the snippet
type State = string; // Assuming State is a string enum
type BlindedSignatures = any; // Using any as a placeholder for cashu.BlindedSignatures

export type P2PKTags = {
	sigflag?: string;
	locktime?: number;
	npubs?: string[];
	k?: string;
	// Add other tag fields as needed
};

export class CashuManager {
	private worker: Worker;
	private callbacks: Map<string, (data: any) => void> = new Map();
	private subscriptions: Map<string, (data: any) => void> = new Map();

	constructor() {
		if (import.meta.env.SSR) return;
		this.worker = new NostrWorker();
		// Wait for the worker to be ready
		this.setupMessageHandler();
	}

	private setupMessageHandler() {
		// Use existing worker from window/global space
		// This assumes the worker is already initialized in main.go
		this.worker.onmessage = (event) => {
			if (!event.data || !event.data.requestID) return;

			const { requestID, data } = event.data;
			const callback = this.callbacks.get(requestID);
			const subscribe = this.subscriptions.get(requestID);

			if (subscribe) {
				subscribe(data);
			}

			if (callback) {
				callback(data);
				// Remove the callback after it's been called
				this.callbacks.delete(requestID);
			}
		};
	}

	private callWalletMethod<T>(methodName: string, ...params: any[]): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const callId = `${methodName}_${params.map((p) => JSON.stringify(p)).join('_')}`;

			// Register the callback
			this.callbacks.set(callId, (result) => {
				if (result instanceof Error) {
					reject(result);
				} else {
					resolve(result as T);
				}
			});

			// Call the wallet method via the global function
			try {
				console.log('Calling wallet method:', methodName, this.walletKey, this.worker);
				this.worker.postMessage({
					action: 'WALLET',
					requestId: callId,
					walletKey: this.walletKey,
					method: methodName,
					params
				});
			} catch (err) {
				this.callbacks.delete(callId); // Clean up
				reject(new Error(`Failed to call wallet method ${methodName}: ${err}`));
			}
		});
	}

	subscribe(subId: string, cb: (result: any) => void): () => void {
		this.subscriptions.set(subId, cb);
		return () => this.unsubscribe(subId);
	}

	unsubscribe(subId: string) {
		this.subscriptions.delete(subId);
	}

	// Store wallet key (secret) for later use
	walletKey: string | null = null;

	// Create a new wallet
	createWallet(secret: string, mintURLs: string[]) {
		this.walletKey = secret;
		this.worker.postMessage({
			action: 'CREATE_WALLET',
			secret,
			mintURLs
		});
	}

	// Check if a wallet is loaded
	isWalletLoaded(): boolean {
		return this.walletKey !== null;
	}

	// Balance Methods
	async getBalance(): Promise<number> {
		return this.callWalletMethod<number>('GetBalance');
	}

	async getBalanceByMints(): Promise<Record<string, number>> {
		return this.callWalletMethod<Record<string, number>>('GetBalanceByMints');
	}

	async getProofsFromMint(mintURL: string): Promise<ProofUnion[]> {
		return this.callWalletMethod<ProofUnion[]>('GetProofsFromMint', mintURL);
	}

	async getPendingBalance(): Promise<number> {
		return this.callWalletMethod<number>('PendingBalance');
	}

	// Mint Methods
	async requestMint(amount: number, mint: string): Promise<MintQuote> {
		console.log('Requesting mint...', this.walletKey);
		return this.callWalletMethod<MintQuote>('RequestMint', amount, mint);
	}

	async getMintQuoteState(quoteId: string): Promise<MintQuote> {
		return this.callWalletMethod<MintQuote>('MintQuoteState', quoteId);
	}

	async mintTokens(quoteId: string): Promise<number> {
		return this.callWalletMethod<number>('MintTokens', quoteId);
	}

	// Send/Receive Methods
	async send(amount: number, mintURL: string, includeFees: boolean): Promise<string> {
		return this.callWalletMethod<string>('Send', amount, mintURL, includeFees);
	}

	async sendToPubkey(
		amount: number,
		mintURL: string,
		pubkeyHex: string,
		tags: P2PKTags | null,
		includeFees: boolean
	): Promise<ProofUnion[]> {
		return this.callWalletMethod<ProofUnion[]>(
			'SendToPubkey',
			amount,
			mintURL,
			pubkeyHex,
			tags,
			includeFees
		);
	}

	async htlcLockedProofs(
		amount: number,
		mintURL: string,
		preimage: string,
		tags: P2PKTags | null,
		includeFees: boolean
	): Promise<string> {
		return this.callWalletMethod<string>(
			'HTLCLockedProofs',
			amount,
			mintURL,
			preimage,
			tags,
			includeFees
		);
	}

	async receive(tokenJson: string, swapToTrusted: boolean): Promise<number> {
		return this.callWalletMethod<number>('Receive', tokenJson, swapToTrusted);
	}

	async receiveHTLC(tokenJson: string, preimage: string): Promise<number> {
		return this.callWalletMethod<number>('ReceiveHTLC', tokenJson, preimage);
	}

	// Melt Methods
	async requestMeltQuote(request: string, mint: string): Promise<MeltQuote> {
		return this.callWalletMethod<MeltQuote>('RequestMeltQuote', request, mint);
	}

	async checkMeltQuoteState(quoteId: string): Promise<MeltQuote> {
		return this.callWalletMethod<MeltQuote>('CheckMeltQuoteState', quoteId);
	}

	async melt(quoteId: string): Promise<any> {
		return this.callWalletMethod<any>('Melt', quoteId);
	}

	async multiMintPayment(request: string, split: Record<string, number>): Promise<any> {
		return this.callWalletMethod<any>('MultiMintPayment', request, split);
	}

	// Mint Management Methods
	async addMint(mint: string): Promise<any> {
		return this.callWalletMethod<any>('AddMint', mint);
	}

	async mintSwap(amount: number, from: string, to: string): Promise<number> {
		return this.callWalletMethod<number>('MintSwap', amount, from, to);
	}

	async getCurrentMint(): Promise<string> {
		return this.callWalletMethod<string>('CurrentMint');
	}

	async getTrustedMints(): Promise<string[]> {
		return this.callWalletMethod<string[]>('TrustedMints');
	}

	async updateMintURL(oldURL: string, newURL: string): Promise<boolean> {
		return this.callWalletMethod<boolean>('UpdateMintURL', oldURL, newURL);
	}

	// Key Management
	async getReceivePubkey(): Promise<string> {
		return this.callWalletMethod<string>('GetReceivePubkey');
	}

	async getMnemonic(): Promise<string> {
		return this.callWalletMethod<string>('Mnemonic');
	}

	// Proof State Methods
	async checkProofState(mintURL: string, proofs: ProofUnion[]): Promise<any> {
		// Convert the proofs to a JSON string
		const proofsJson = JSON.stringify(proofs);
		return this.callWalletMethod<any>('CheckProofState', mintURL, proofsJson);
	}

	async removeSpentProofs(): Promise<boolean> {
		return this.callWalletMethod<boolean>('RemoveSpentProofs');
	}

	async reclaimUnspentProofs(): Promise<number> {
		return this.callWalletMethod<number>('ReclaimUnspentProofs');
	}

	// Quote Management Methods
	async getPendingMeltQuotes(): Promise<MeltQuote[]> {
		return this.callWalletMethod<MeltQuote[]>('GetPendingMeltQuotes');
	}

	async getMintQuotes(): Promise<MintQuote[]> {
		return this.callWalletMethod<MintQuote[]>('GetMintQuotes');
	}

	async getMintQuoteById(id: string): Promise<MintQuote | null> {
		return this.callWalletMethod<MintQuote | null>('GetMintQuoteById', id);
	}

	async getMintQuoteByPaymentRequest(request: string): Promise<MintQuote | null> {
		return this.callWalletMethod<MintQuote | null>('GetMintQuoteByPaymentRequest', request);
	}

	async getMeltQuotes(): Promise<MeltQuote[]> {
		return this.callWalletMethod<MeltQuote[]>('GetMeltQuotes');
	}

	async getMeltQuoteById(id: string): Promise<MeltQuote | null> {
		return this.callWalletMethod<MeltQuote | null>('GetMeltQuoteById', id);
	}

	// Shutdown the wallet and clean up resources
	async shutdown(): Promise<boolean> {
		try {
			const result = await this.callWalletMethod<boolean>('Shutdown');
			// Clear the wallet key if shutdown was successful
			if (result) {
				this.walletKey = null;
			}
			return result;
		} catch (error) {
			console.error('Error shutting down wallet:', error);
			return false;
		}
	}
}

// Export a singleton instance
export const cashuManager = new CashuManager();
