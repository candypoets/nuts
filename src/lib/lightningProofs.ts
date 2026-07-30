import { getManager } from '@candypoets/nipworker';
import type { Proof } from '@cashu/cashu-ts';
import type { EventTemplate, NostrEvent } from 'nostr-tools';

import {
	constructProofAuthorizationEvent,
	queryClaimableProofs
} from 'src/lib/lightningAddressClient';

type ProofReceiver = {
	receiveProofs: (mint: string, proofs: Proof[]) => Promise<Proof[]>;
};

type ProofSyncState = {
	receivedThrough: number;
	paymentIds: string[];
};

export type LightningProofClaim = {
	receivedPayments: number;
	receivedSats: number;
	receivedThrough: number;
};

const activeClaims = new Map<string, Promise<LightningProofClaim>>();

function proofSyncStorageKey(pubkey: string): string {
	return `lnuts/proofs/${pubkey}`;
}

function loadProofSyncState(pubkey: string): ProofSyncState {
	try {
		const stored = JSON.parse(localStorage.getItem(proofSyncStorageKey(pubkey)) || '{}');
		return {
			receivedThrough:
				Number.isSafeInteger(stored.receivedThrough) && stored.receivedThrough >= 0
					? stored.receivedThrough
					: 0,
			paymentIds: Array.isArray(stored.paymentIds)
				? stored.paymentIds.filter((id: unknown): id is string => typeof id === 'string')
				: []
		};
	} catch {
		return { receivedThrough: 0, paymentIds: [] };
	}
}

function saveProofSyncState(pubkey: string, state: ProofSyncState): void {
	localStorage.setItem(
		proofSyncStorageKey(pubkey),
		JSON.stringify({
			receivedThrough: state.receivedThrough,
			paymentIds: state.paymentIds.slice(-250)
		})
	);
}

function signEvent(template: EventTemplate, timeoutMs = 10_000): Promise<NostrEvent> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(
			() => reject(new Error('Timed out while requesting the Nostr signature.')),
			timeoutMs
		);
		getManager().signEvent(template, (event) => {
			window.clearTimeout(timeout);
			resolve(event);
		});
	});
}

async function claim(pubkey: string, wallet: ProofReceiver): Promise<LightningProofClaim> {
	const state = loadProofSyncState(pubkey);
	const proofsUrl = new URL('/api/proofs', window.location.origin);
	if (state.receivedThrough > 0) {
		proofsUrl.searchParams.set('since', String(state.receivedThrough));
	}

	const authorization = constructProofAuthorizationEvent(pubkey, proofsUrl.toString());
	const signed = await signEvent(authorization);
	const result = await queryClaimableProofs(signed, proofsUrl.toString());
	const importedPaymentIds = [...state.paymentIds];
	let receivedSats = 0;
	let receivedPayments = 0;

	for (const payment of result.proofs) {
		if (importedPaymentIds.includes(payment.paymentId)) continue;
		if (!Array.isArray(payment.token?.token) || payment.token.token.length === 0) {
			throw new Error(`Payment ${payment.paymentId} did not contain a Cashu token.`);
		}

		for (const token of payment.token.token) {
			const received = await wallet.receiveProofs(token.mint || payment.mintUrl, token.proofs);
			receivedSats += received.reduce((total, proof) => total + proof.amount, 0);
		}

		receivedPayments += 1;
		importedPaymentIds.push(payment.paymentId);
		state.paymentIds = importedPaymentIds;
		saveProofSyncState(pubkey, state);
	}

	state.receivedThrough = result.receivedThrough;
	state.paymentIds = importedPaymentIds;
	saveProofSyncState(pubkey, state);

	return { receivedPayments, receivedSats, receivedThrough: result.receivedThrough };
}

export function claimLightningProofs(
	pubkey: string,
	wallet: ProofReceiver
): Promise<LightningProofClaim> {
	const existing = activeClaims.get(pubkey);
	if (existing) return existing;

	const pending = claim(pubkey, wallet).finally(() => activeClaims.delete(pubkey));
	activeClaims.set(pubkey, pending);
	return pending;
}
