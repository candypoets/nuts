import { decode } from 'light-bolt11-decoder';
import { SimplePool, type NostrEvent } from 'nostr-tools';
import { addEvent, nostrDb } from 'src/db';
import type { Request } from 'src/workers/utils';

export type Kind9735Parsed = {
	id: string;
	amount: number; // Amount in sats
	content: string; // Content from the zap request
	bolt11: string; // Lightning invoice
	preimage?: string; // Payment preimage (optional)
	sender: string; // Pubkey of sender
	recipient: string; // Pubkey of recipient
	event?: string; // ID of the event being zapped (if any)
	eventCoordinate?: string; // Event coordinate for addressable events (if any)
	timestamp: number; // When the zap was created
	valid: boolean; // Whether the zap appears valid
	description: any; // The original zap request data
};

const INDEXER_RELAYS = (import.meta.env.VITE_INDEXER_RELAYS || '').split(',').filter(Boolean);

export async function parseKind9735(
	event: NostrEvent,
	EOSERequests?: Request[] | undefined
): Promise<Kind9735Parsed | null> {
	const db = await nostrDb;
	if (!db) return null;
	// Ensure this is a zap receipt event
	if (!event || event.kind !== 9735) return null;

	const pool = new SimplePool();

	try {
		// Extract tags
		const pTag = event.tags.find((tag) => tag[0] === 'p');
		const eTag = event.tags.find((tag) => tag[0] === 'e');
		const aTag = event.tags.find((tag) => tag[0] === 'a');
		const bolt11Tag = event.tags.find((tag) => tag[0] === 'bolt11');
		const descriptionTag = event.tags.find((tag) => tag[0] === 'description');
		const preimageTag = event.tags.find((tag) => tag[0] === 'preimage');
		const senderTag = event.tags.find((tag) => tag[0] === 'P'); // Capital P for sender

		// Require mandatory tags
		if (!pTag || !bolt11Tag || !descriptionTag) {
			return null;
		}

		// Parse the zap request from the description tag
		let zapRequest;
		try {
			zapRequest = JSON.parse(descriptionTag[1]);
		} catch (e) {
			console.error('Failed to parse zap request description:', e);
			return null;
		}

		// Validate that the zap request is properly formed
		if (!zapRequest || zapRequest.kind !== 9734 || !zapRequest.tags) {
			return null;
		}

		// Extract amount from bolt11 invoice
		let amount = 0;
		try {
			const amountTag = zapRequest.tags.find((tag) => tag[0] === 'amount');
			if (amountTag && amountTag[1]) {
				amount = Math.round(parseInt(amountTag[1], 10) / 1000);
			} else {
				// Decode the bolt11 invoice to get the amount
				const decodedInvoice = decode(bolt11Tag[1]);

				// Find the amount section in the decoded invoice
				const amountSection = decodedInvoice.sections.find((section) => section.name === 'amount');

				if (amountSection && 'value' in amountSection) {
					// The amount is in millisatoshis
					amount = Math.round(Number(amountSection.value) / 1000);
				}
			}
		} catch (e) {
			console.error('Failed to parse amount:', e);
		}

		const sender = senderTag ? senderTag[1] : zapRequest.pubkey;
		if (EOSERequests) {
			// Extract the relay hints from the zap request
			const relaysTagInRequest = zapRequest.tags.find((tag) => tag[0] === 'relays');
			const zapperRelayHints = relaysTagInRequest
				? relaysTagInRequest.slice(1)
				: event.relays || INDEXER_RELAYS;
			EOSERequests.push({
				kinds: [0],
				authors: [event.pubkey],
				relays: zapperRelayHints
			});
		} else {
			const result = await pool.querySync(event.relays || INDEXER_RELAYS, {
				kinds: [0],
				authors: [event.pubkey]
			});
			await addEvent(db, result?.[0]);
		}
		// Create the parsed zap receipt
		const receipt: Kind9735Parsed = {
			id: event.id,
			amount,
			content: zapRequest.content || '',
			bolt11: bolt11Tag[1],
			sender,
			recipient: pTag[1],
			event: eTag ? eTag[1] : undefined,
			eventCoordinate: aTag ? aTag[1] : undefined,
			timestamp: event.created_at,
			valid: true, // We'll validate below
			description: zapRequest,
			preimage: preimageTag ? preimageTag[1] : undefined
		};

		// Perform basic validation
		// 1. The zap request should have the same recipient as the receipt
		const requestPTag = zapRequest.tags.find((tag) => tag[0] === 'p');
		if (!requestPTag || requestPTag[1] !== receipt.recipient) {
			receipt.valid = false;
		}

		// 2. If the receipt has an event ID, the request should also have it
		if (receipt.event) {
			const requestETag = zapRequest.tags.find((tag) => tag[0] === 'e');
			if (!requestETag || requestETag[1] !== receipt.event) {
				receipt.valid = false;
			}
		}

		// 3. If the receipt has an event coordinate, the request should also have it
		if (receipt.eventCoordinate) {
			const requestATag = zapRequest.tags.find((tag) => tag[0] === 'a');
			if (!requestATag || requestATag[1] !== receipt.eventCoordinate) {
				receipt.valid = false;
			}
		}

		// Note: Full validation would require:
		// - Verifying the zap request signature
		// - Checking that the lnurl in the request matches the recipient's lnurl
		// - Confirming the receipt issuer matches the recipient's nostrPubkey

		return receipt;
	} catch (error) {
		console.error('Failed to parse zap receipt:', error);
		return null;
	}
}
