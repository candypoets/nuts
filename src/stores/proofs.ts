import { derived, get } from 'svelte/store';
import { signer } from './signer';
import { timestamp1 } from './time';
import { Status, key, keysetsCache, pendingProofs, proofs, proofsCache } from './db';
import { CashuMint, CashuWallet, getEncodedToken, type Proof } from '@cashu/cashu-ts';
import { checkProofsSpent, getKeysForUnit } from 'src/actions/wallet';
import { sendMessage } from 'src/actions/chat';

// when new pendingProofs are added, try to claim them
export const claimPendingSub = derived([signer, timestamp1], async ([$signer, $time]) => {
	const pp = get(pendingProofs);
	if (!pp.length) return;

	// organize proofs by mint
	const proofsByKeySet = pp.reduce(
		(acc, cur) => {
			if (!acc[cur.id]) acc[cur.id] = [];
			acc[cur.id].push(cur);
			return acc;
		},
		{} as Record<string, Proof[]>
	);
	for (const keysetId in proofsByKeySet) {
		const m = get(keysetsCache).get(keysetId);
		if (!m) {
			console.error('could not find mint for keyset', keysetId);
			continue;
		}
		const cashuMint = new CashuMint(m.mint);

		const cashukeys = await cashuMint.getKeys();
		// const keysets = await cashu.getKeySets();
		const keys = getKeysForUnit(cashukeys.keysets);
		const wallet: CashuWallet = new CashuWallet(cashuMint, keys);
		// if (!validateMintKeys(keys)) {
		// 	return;
		// }
		try {
			console.log('claiming', proofsByKeySet[keysetId], get(key)?.priv, get(key)?.pub);
			const res = await wallet.receiveTokenEntry({
				proofs: proofsByKeySet[keysetId],
				mint: m.mint
			});
			console.log('res', res);
			proofsCache.bulkPut([
				...res.proofs.map((p) => ({ ...p, status: Status.Confirmed })),
				...proofsByKeySet[keysetId].map((p) => ({ ...p, status: Status.Spent }))
			]);
			if (res.proofs.length) {
				// add the proofs to the nostr
				console.info('saving nuts');
				await sendMessage(
					$signer,
					get(key)?.pub,
					getEncodedToken({ token: [{ mint: m.mint, proofs: res.proofs }] }),
					[['nuts']]
				);
				// await saveNuts(res.proofs, get(key)?.pub);
			}
		} catch (e) {
			console.error(e);
			// proofsCache.bulkPut(proofsByKeySet[key].map((p) => ({ ...p, status: Status.Spent })));
		}
	}
});

export const proofSpentSub = () => {
	let lastCheck = '';
	// // every 10 seconds, check if the proofs are spent
	return derived([timestamp1], async ([$time]) => {
		if (lastCheck == JSON.stringify(get(proofs))) return;
		const errors = await checkProofsSpent(get(proofs));
		if (!errors.length) {
			lastCheck = JSON.stringify(get(proofs));
		}
	});
};
