import { derived } from 'svelte/store';
import { db, invoices, key, type Invoice, proofsCache } from './db';
import { signer } from './signer';
import { timestamp10 } from './time';
import { browser } from '$app/environment';
import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';
import { decode } from '@gandlaf21/bolt11-decode';
import { sendMessage } from 'src/actions/chat';

export const claimInvoicesSub = () => {
	// claim pending invoices
	let timestampIndex = 0;
	return derived(
		[key, db, invoices, signer, timestamp10],
		async ([$key, $db, $invoices, $signer]) => {
			if (!browser) return;
			if (!$key?.pub) return;

			timestampIndex++;
			// for fresh invoices, try to claim them on every timestamp
			$invoices.forEach(async (invoice, i) => {
				i = i % 30;
				const minting = async (invoice: Invoice) => {
					const cashuMint = new CashuMint(invoice.mint);
					const keys = await cashuMint.getKeys();
					const wallet = new CashuWallet(cashuMint, keys.keysets[0]);
					const amount = decode(invoice.request).sections[2].value / 1000;
					wallet.mintTokens(amount, invoice.quote).then(async (res) => {
						const encodedToken = getEncodedToken({
							token: [{ proofs: res.proofs, mint: invoice.mint }],
							memo: 'invoice'
						});
						// will be claimed twice probably
						// adding anyway in case the message is not sent
						res.proofs.forEach((p) => proofsCache.add(p));
						// await $db.proofs.bulkAdd(res.proofs);
						await sendMessage($signer, $key.pub, encodedToken);

						$db.invoices.delete(invoice.quote);

						// checkProofsSpent();
						// send the token to the profile public address
					});
				};
				if (Date.now() / 1000 - invoice.date < 60 * 5) {
					await minting(invoice);
				} else if (timestampIndex % 30 === i) {
					await minting(invoice);
				}
			});
		}
	);
};
