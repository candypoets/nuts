<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { EventTemplate, NostrEvent } from 'nostr-tools';
	import { getContext, onMount, tick } from 'svelte';

	import MintSelector from 'src/components/MintSelector.svelte';
	import VirtualList from 'src/components/VirtualList.svelte';
	import { key, kind17375, kind10019 as walletKind10019, readRelays } from 'src/controller';
	import { activeMintUrl } from 'src/controller/wallet';
	import { now } from 'src/lib/period';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import { getInvoiceFromProfile, GetLNURLFromProfile, getZapInvoice } from 'src/lib/wallet';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';

	import {
		Kind10002Parsed,
		ParsedData,
		WorkerMessage,
		type Kind10019Parsed,
		type ParsedEvent,
		type RequestObject
	} from '@candypoets/nipworker';
	import { useSignEvent, useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind10002,
		asKind10019,
		asKind17375,
		fbArray,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import { type MeltQuoteResponse, type MintQuoteResponse, type Proof } from '@cashu/cashu-ts';
	import { throttle } from 'lodash';
	import TransactionStatus from 'src/components/TransactionStatus.svelte';
	import { nutsWallet } from 'src/controller/proofs';
	import {
		completeTransaction,
		failTransaction,
		markPublished,
		publishWithRetry,
		startTransaction,
		updateTransaction,
		type TxType
	} from 'src/model/cashu/tx-recovery';
	import { fly } from 'svelte/transition';
	import { getUserRelays } from '../queries/user';

	const normalizeRelay = (relay?: string | null): string | null => {
		if (!relay) return null;
		return relay.trim().replace(/\/$/, '');
	};

	const uniqueRelays = (relays: Array<string | null | undefined>): string[] => {
		const set = new Set<string>();
		for (const relay of relays) {
			const normalized = normalizeRelay(relay);
			if (normalized) set.add(normalized);
		}
		return Array.from(set);
	};

	// export let active: string;
	export let pubkey: string;
	export let noteId: string;
	export let amount = 21;

	let animator = getContext('animator');
	let memo: string = '';

	let note: ParsedEvent;
	let kind0: ParsedEvent;

	let processing = '';
	let scroller: HTMLElement;

	let kind10019: Kind10019Parsed;

	let zap = true;
	let receiptRelays: string[] = [];

	$: walletReadRelays =
		$walletKind10019 &&
		(fbArray(asKind10019($walletKind10019) as Kind10019Parsed, 'readRelays')
			?.map((r) => r.toString()) || []);

	$: zapReceiptRelays = uniqueRelays([
		...receiptRelays,
		...($readRelays || []),
		...(walletReadRelays || []),
		...DEFAULT_RELAYS
	]);

	let status = '';
	let progress = 0;

	// Derive transaction state for the animated display
	$: txState = (() => {
		if (status?.startsWith('Error:')) {
			return { state: 'failed' as const, message: status.replace('Error: ', '') };
		}
		if (status === 'No proofs available') {
			return { state: 'failed' as const, message: status };
		}
		if (processing === 'sending' || processing) {
			return { state: 'processing' as const, message: status || processing, progress: 0.5 };
		}
		if (processing === 'generating invoice') {
			return { state: 'processing' as const, message: 'Generating invoice...', progress: 0.3 };
		}
		if (status && status.includes('sent')) {
			return { state: 'success' as const, message: status };
		}
		if (status === 'This user has not set up their profile for zaps.') {
			return { state: 'failed' as const, message: status };
		}
		return { state: 'idle' as const, message: '' };
	})();

	let balanceByMint = $nutsWallet?.balanceByMint;

	let fromMint = $activeMintUrl || ($kind17375 && asKind17375($kind17375)?.mints(0)?.toString());
	let toMint: string;
	let fees: number | undefined;
	let meltquote: MeltQuoteResponse | undefined;
	let mintquote: MintQuoteResponse | undefined;

	const resetState = () => {
		fees = undefined;
		meltquote = undefined;
		mintquote = undefined;
		processing = '';
		// status = '';
		progress = 0;
	};

	$: balance = $balanceByMint?.[fromMint || ''] || 0;
	$: amountPlusFees = Number(amount || 0) + Number(fees || 0);

	onMount(() => {
		const requests: RequestObject[] = [
			{ kinds: [0], authors: [pubkey], limit: 1, cacheFirst: true, relays: [] },
			{ kinds: [10002], authors: [pubkey], limit: 3, cacheFirst: true, relays: [] },
			{ kinds: [10019], authors: [pubkey], limit: 3, cacheFirst: true, relays: [] }
		];
		if (noteId) requests.push({ kinds: [1], ids: [noteId], cacheFirst: true, relays: [] });
		getUserRelays(pubkey, (relays: string[]) => {
			useSubscription('wallet_' + pubkey, requests, (message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (parsedEvent) {
					switch (parsedEvent.parsedType()) {
						case ParsedData.Kind10019Parsed:
							kind10019 = asKind10019(parsedEvent) as Kind10019Parsed;
							toMint = kind10019?.trustedMints(0)?.url()?.toString() as string;
							zap = false;
							break;
						case ParsedData.Kind10002Parsed:
							const kind1002 = asKind10002(parsedEvent) as Kind10002Parsed;
							receiptRelays = (fbArray(kind1002, 'relays')
								?.map((r) => r.read() && r.url()?.toString())
								.filter(Boolean) || []) as string[];
							break;
						case ParsedData.Kind1Parsed:
							note = parsedEvent;
							tick().then(() => scrollTo({ top: 10000 }));
							break;
						case ParsedData.Kind0Parsed:
							kind0 = parsedEvent;
							computeFees(Number(amount), fromMint || '', toMint || '', zap);
							break;
					}
				}
			});
		});
	});

	const computeFees = throttle(
		async (amount: number, fromMint: string, toMint: string, zap: boolean) => {
			if (fromMint && toMint && amount && toMint != fromMint && !zap) {
				try {
					processing = 'generating invoice';
					// attempt a swap to a supported mint before sending
					const fromWallet = await $nutsWallet?.getWallet(fromMint);
					const toWallet = await $nutsWallet?.getWallet(toMint);
					if (toWallet && fromWallet && kind10019?.p2pkPubkey) {
						mintquote = await toWallet.createMintQuote(amount, kind10019.p2pkPubkey()?.toString());
						meltquote = await fromWallet.createMeltQuote(mintquote.request);
						fees = meltquote.fee_reserve;
						processing = '';
					}
				} catch (e) {
					console.error(e);
					processing = 'error';
				}
			} else if (fromMint && amount && kind0 && toMint != fromMint) {
				processing = 'generating invoice';
				try {
					const { pr } = await getInvoiceFromProfile(kind0, Number(amount));
					console.log(pr);
					const fromWallet = await $nutsWallet?.getWallet(fromMint);
					console.log(fromWallet);
					meltquote = await fromWallet!.createMeltQuote(pr);
					console.log('computedFees', amount, fromMint, meltquote);
					fees = meltquote.fee_reserve;
					processing = '';
				} catch (e) {
					processing = 'error';
					console.log('error', e);
				}
			} else {
				fees = 0;
				meltquote = undefined;
				processing = '';
			}
		},
		300
	);

	$: computeFees(amount, fromMint, toMint, zap);

	$: lnurl = GetLNURLFromProfile(kind0);

	$: disabled =
		!amount ||
		!Number(amount) ||
		amountPlusFees > (balance || 0) ||
		!!status ||
		(!kind10019 && !lnurl) ||
		!!processing;

	$: if (!lnurl) {
		status = 'This user has not set up their profile for zaps.';
	} else {
		status = '';
	}

	const sendEcash = async () => {
		if (!fromMint || !$nutsWallet) return;

		processing = 'sending';

		// Determine transaction type
		let txType: TxType;
		if (zap && lnurl) {
			txType = 'zap';
		} else if (fromMint !== toMint && toMint && !zap) {
			txType = 'nutszap-melt';
		} else {
			txType = 'nutszap';
		}

		// Get wallet and select proofs
		const wallet = await $nutsWallet.getWallet(fromMint);
		const unspentProofs = $nutsWallet.unspentProofs.get(fromMint) || [];
		const { keep, send: proofs } = wallet.selectProofsToSend(unspentProofs, amountPlusFees, true);

		if (!proofs?.length) {
			status = 'No proofs available';
			processing = '';
			setTimeout(() => (status = ''), 3000);
			return;
		}

		// Temporarily update wallet with reserved proofs (keep only)
		$nutsWallet.unspentProofs.set(fromMint, keep);
		$nutsWallet.updateBalanceByMint();

		const txId = await startTransaction(
			txType,
			{
				fromMint,
				toMint: toMint || undefined,
				pubkey,
				amount: Number(amount),
				memo,
				noteId: noteId || undefined,
				lnurl: lnurl || undefined,
				p2pkPubkey: kind10019?.p2pkPubkey()?.toString(),
				receiptRelays: zapReceiptRelays.length > 0 ? zapReceiptRelays : undefined
			},
			proofs
		);

		try {
			await executeTransaction(txId, txType, proofs, keep);
			// Don't close modal on success - let user see the result
		} catch (err) {
			console.error('[ecash] Send failed:', err);

			const errorMsg = (err as Error).message || '';

			// Try to recover from "already spent" error
			if (errorMsg.toLowerCase().includes('spent') && $nutsWallet) {
				console.log('[ecash] Attempting to recover from spent token error...');
				status = 'Checking for spent tokens...';

				try {
					const validProofs = await $nutsWallet.checkAndFilterProofs(fromMint, proofs);
					if (validProofs.length === 0) {
						status = 'All tokens already spent';
					} else if (validProofs.length < proofs.length) {
						console.log(`[ecash] Recovered ${validProofs.length}/${proofs.length} unspent proofs`);
						status = `Recovered ${validProofs.length} unspent proofs, please try again`;
						// Return only valid proofs to wallet
						$nutsWallet.addProofs(fromMint, validProofs);
					} else {
						// Proofs were valid but error was something else, retry
						$nutsWallet.addProofs(fromMint, proofs);
						status = 'Error, please try again';
					}
				} catch (recoverErr) {
					console.error('[ecash] Recovery failed:', recoverErr);
					// Return proofs as-is
					$nutsWallet.addProofs(fromMint, proofs);
					status = 'Error: ' + errorMsg;
				}
			} else {
				// Not a spent token error
				await failTransaction(txId, errorMsg);
				$nutsWallet.addProofs(fromMint, proofs);
				status = 'Error: ' + errorMsg;
			}

			processing = '';
			setTimeout(() => (status = ''), 4000);
		}
	};

	// Execute the transaction based on type
	const executeTransaction = async (
		txId: string,
		txType: TxType,
		proofs: Proof[],
		keep: Proof[]
	) => {
		if (txType === 'zap' && lnurl && kind0 && fromMint) {
			console.log('send zap', amount, fromMint, lnurl);

			// Create zap request (kind 9734) for NIP-57 compliance
			const zapRequest = {
				kind: 9734,
				content: memo,
				created_at: now(),
				tags: [
					['p', pubkey],
					...(noteId ? [['e', noteId]] : []),
					[
						'relays',
						...(zapReceiptRelays.length > 0
							? zapReceiptRelays
							: ['wss://relay.damus.io', 'wss://nos.lol'])
					]
				]
			};

			// Sign the zap request and get invoice
			await new Promise<void>((resolve, reject) => {
				useSignEvent(zapRequest, async (signedZapRequest) => {
					try {
						// Get invoice with zap request (LNURL will publish kind 9735 receipt)
						const { pr } = await getZapInvoice(
							lnurl,
							Number(amount),
							signedZapRequest as NostrEvent
						);
						console.log('send zap with request', amount, fromMint, lnurl, pr);

						const wallet = await $nutsWallet!.getWallet(fromMint);
						const meltquote = await wallet.createMeltQuote(pr);

						await updateTransaction(txId, { meltQuote: { ...meltquote, mintUrl: fromMint } });

						const { quote, change } = await wallet.meltProofs(meltquote, proofs);
						if (quote.state !== 'PAID') throw new Error('Payment failed');

						status = 'Zap sent! ⚡️';
						// Clear status after 1.5 seconds to show idle state
						setTimeout(() => {
							status = '';
							processing = '';
						}, 1500);
						console.log('Zapped ⚡️', amount, quote.payment_preimage);
						// Update wallet: keep + change as unspent, mark sent proofs as spent
						$nutsWallet!.saveProofs(fromMint, keep.concat(change || []));
						// Mark sent proofs as spent
						// Verify with mint (safety net)
						$nutsWallet!
							.verifyAndCleanProofs()
							.catch((e) => console.warn('[ecash] Post-send verification failed:', e));
						console.log('[ecash] Zap sent:', pr);
						resolve();
					} catch (err) {
						reject(err);
					}
				});
			});
		} else if (txType === 'nutszap-melt' && toMint && fromMint && kind10019?.p2pkPubkey) {
			console.log('send nutszap melt', amount, fromMint, toMint);

			const fromWallet = await $nutsWallet!.getWallet(fromMint);
			const toWallet = await $nutsWallet!.getWallet(toMint);

			const mintquote = await toWallet.createMintQuote(amount, kind10019.p2pkPubkey()!.toString());
			const meltquote = await fromWallet.createMeltQuote(mintquote.request);

			await updateTransaction(txId, {
				meltQuote: { ...meltquote, mintUrl: fromMint },
				mintQuote: { ...mintquote, mintUrl: toMint }
			});

			const { quote: meltQuoteResult, change } = await fromWallet.meltProofs(meltquote, proofs);
			if (meltQuoteResult.state !== 'PAID') throw new Error('Cross-mint swap failed');

			console.log('awaiting mint...', amount);
			// Poll for mint quote to be paid
			let isPaid = false;
			let attempts = 0;
			const maxAttempts = 60;
			while (!isPaid && attempts < maxAttempts) {
				const mintStatus = await toWallet.checkMintQuote(mintquote.quote);
				if (mintStatus.state === 'PAID') {
					isPaid = true;
				} else {
					attempts++;
					await new Promise((r) => setTimeout(r, 1000));
				}
			}
			if (!isPaid) throw new Error('Mint timeout');

			// Mint the proofs
			const mintedProofs = await toWallet.mintProofs(amount, mintquote.quote);

			console.log('Melted and Minted', amount, 'proofs', mintedProofs.length);

			// Update fromMint wallet: keep + change as unspent
			$nutsWallet!.unspentProofs.set(fromMint, keep.concat(change || []));
			// Mark sent proofs as spent
			$nutsWallet!.removeProofs(fromMint, proofs);
			$nutsWallet!.saveProofs(fromMint, keep.concat(change || []));
			// Verify with mint (safety net)
			$nutsWallet!
				.verifyAndCleanProofs()
				.catch((e) => console.warn('[ecash] Post-send verification failed:', e));

			// Lock minted proofs to recipient and build nutzap
			const recipientPubkey = kind10019?.p2pkPubkey()?.toString() || pubkey;
			const lockedProofs = await toWallet.receive(
				{ mint: toMint, proofs: mintedProofs, unit: 'sat' },
				{},
				{ type: 'p2pk', options: { pubkey: recipientPubkey } }
			);

			const nutzapEvent: EventTemplate = {
				kind: 9321,
				content: memo,
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					...lockedProofs.map((p: Proof) => ['proof', JSON.stringify(p)]),
					['u', toMint],
					['e', noteId || ''],
					['p', pubkey]
				].filter((t: string[]) => !!t[1])
			};

			await updateTransaction(txId, { nutzapEvent });
			// Try to publish - if it fails, transaction will be pending_publish
			const published = await publishWithRetry(nutzapEvent);
			if (published) {
				await markPublished(txId);
				status = 'Zap sent! ⚡️';
				// Clear status after 1.5 seconds to show idle state
				setTimeout(() => {
					status = '';
					processing = '';
				}, 1500);
				console.log('[ecash] Nutzap published and transaction completed');
			} else {
				// Mark as pending publish - user can retry later
				await completeTransaction(txId, true);
				status = 'Waiting for publish...';
				console.warn('[ecash] Nutzap publish failed - transaction pending, you can retry later');
			}
		} else {
			// Simple nutszap (same mint)
			console.log('send nutszap', amount, fromMint, pubkey);
			status = 'Sending...';

			if (!fromMint) throw new Error('No mint selected');

			// Get wallet for locking proofs
			const fromWallet = await $nutsWallet!.getWallet(fromMint);

			// Lock proofs to recipient
			const lockedProofs = await fromWallet.receive(
				{ mint: fromMint, proofs, unit: 'sat' },
				{},
				{ type: 'p2pk', options: { pubkey } }
			);

			const nutzapEvent: EventTemplate = {
				kind: 9321,
				content: memo,
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					...lockedProofs.map((p: Proof) => ['proof', JSON.stringify(p)]),
					['u', fromMint],
					['e', noteId || ''],
					['p', pubkey]
				].filter((t: string[]) => !!t[1])
			};

			console.log('nutzapEvent', nutzapEvent);
			// Update wallet with keep only (proofs were sent)
			$nutsWallet!.unspentProofs.set(fromMint, keep);
			$nutsWallet!.saveProofs(fromMint, keep);
			// Mark sent proofs as spent
			$nutsWallet!.removeProofs(fromMint, proofs);
			// Verify with mint (safety net)
			$nutsWallet!
				.verifyAndCleanProofs()
				.catch((e) => console.warn('[ecash] Post-send verification failed:', e));

			await updateTransaction(txId, { nutzapEvent });
			// Try to publish - if it fails, transaction will be pending_publish
			const published = await publishWithRetry(nutzapEvent);
			if (published) {
				await markPublished(txId);
				status = 'Sent! 🎉';
				// Clear status after 1.5 seconds to show idle state
				setTimeout(() => {
					status = '';
					processing = '';
				}, 1500);
				console.log('[ecash] Nutzap published and transaction completed');
			} else {
				// Mark as pending publish - user can retry later
				await completeTransaction(txId, true);
				status = 'Waiting for publish...';
				console.warn('[ecash] Nutzap publish failed - transaction pending, you can retry later');
			}
		}
	};
</script>

<svelte:window
	on:keydown={(e) => {
		// Command (Meta) + Enter or Ctrl + Enter
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			// Mirror disabled conditions
			if (!!processing) return;
			if (!amount || !Number(amount) || amountPlusFees > (balance || 0) || !!status) return;

			e.preventDefault();
			e.stopPropagation();
			sendEcash();
		}
	}}
/>

<div class="flex items-start md:items-center h-screen" on:click|stopPropagation={animator.goBack}>
	<div
		class="bg-base-300 bg-opacity-85 md:border border-primary-content w-full rounded-xl md:p-4 md:max-h-[90vh] md:h-auto backdrop-blur-sm pt-safe h-screen"
		on:click|stopPropagation
	>
		<VirtualList items={[]} height="100%" bind:viewport={scroller} getItemId={() => 'header'}>
			<div slot="feed-header">
				<div>
					<button on:click={animator.goBack} class="btn btn-ghost btn-sm">
						<Icon icon="mingcute:down-line" class="text-xl" />
					</button>
					<!-- {#if note}
						<div class="p-4">
							<Note {note} context={[]} footer={false} showRoot={false} visible />
						</div>
						<div class="mx-8 mt-4 border-b border-gray-600"></div>
					{/if} -->
					<div class="md:p-4">
						<div class="flex md:gap-4 items-center justify-around">
							<div class="w-1/3 text-center">
								<MintSelector
									mints={($kind17375 && fbArray(asKind17375($kind17375), 'mints'))?.map((mint) =>
										mint?.toString()
									) || []}
									pubkey={$key?.pub}
									bind:activeMint={fromMint}
								/>
							</div>

							<div class="flex justify-center">
								<Icon icon="mdi:arrow-right" class="text-5xl text-gray-400" />
							</div>
							<div class="w-1/3">
								{#if kind10019 && !zap}
									<MintSelector
										{pubkey}
										mints={fbArray(kind10019, 'trustedMints')?.map((m) => m.url()?.toString()) ||
											[]}
										chevron="right"
										bind:activeMint={toMint}
									/>
								{:else}
									<div
										class="flex gap-2 items-center justify-center py-2 border-b last:border-none w-1/2"
									>
										<!-- <Icon icon="carbon:lightning" class="w-16 h-6" />
											-->
										<Avatar {pubkey} size="lg" />
										<User {pubkey} link={false} />
									</div>
								{/if}
							</div>
						</div>
					</div>
					<div>
						<div class="w-full gap-3">
							<div class="md:h-52 flex flex-col items-center">
								{#if !status && !processing}
									<div class="join items-center mt-10">
										<div class="join-item w-0">
											<Icon icon="bitcoin-icons:satoshi-v2-filled" class="text-4xl" />
										</div>
										<input
											id="send-amt"
											placeholder="0"
											type="text"
											inputmode="decimal"
											autocomplete="off"
											bind:value={amount}
											class="join-item text-7xl bg-transparent caret-transparent focus:outline-none text-center max-w-xs rounded-xl"
											on:keydown|stopPropagation={(e) => {
												if (!!processing) return;
												if (e.key === 'Enter') {
													sendEcash();
												}
											}}
										/>
									</div>
									<div class="flex items-center justify-center gap-6 mt-4">
										<button
											type="button"
											class="btn btn-ghost text-3xl"
											title="Set amount to 21"
											on:click={() => {
												if (!!processing) return;
												amount = 21;
											}}>🥜</button
										>
										<button
											type="button"
											class="btn btn-ghost text-3xl"
											title="Set amount to 42"
											on:click={() => {
												if (!!processing) return;
												amount = 42;
											}}>🍫</button
										>
										<button
											type="button"
											class="btn btn-ghost text-3xl"
											title="Set amount to 69"
											on:click={() => {
												if (!!processing) return;
												amount = 69;
											}}>⚡️</button
										>
										<button
											type="button"
											class="btn btn-ghost text-3xl"
											title="Set amount to 420"
											on:click={() => {
												if (!!processing) return;
												amount = 420;
											}}>🚀</button
										>
									</div>
								{:else}
									<TransactionStatus
										state={txState.state}
										message={txState.message}
										progress={txState.progress}
									/>
								{/if}
							</div>
						</div>
						{#if fees === 0 && zap}
							<div class="px-4 w-full mt-4" transition:fly>
								<div class="text-sm text-primary">No fees applies</div>
							</div>
						{/if}
						{#if fees}
							<div class="px-4 w-full mt-4" transition:fly>
								<div class="text-sm text-primary">
									A fee of {fees} sats may apply for this transaction. This covers Lightning network costs
									and is only reserved - you might get some or all of it refunded.
								</div>
							</div>
						{/if}
						<div class="px-4 w-full my-8">
							<input
								type="text"
								placeholder="Add a memo"
								bind:value={memo}
								class="input w-full join-item md:hidden block my-4 input-bordered"
							/>
							<div class="join w-full pb-4">
								<label class="swap join-item border bg-base-300">
									<input type="checkbox" bind:checked={zap} />
									<div class="swap-on px-4">
										<Icon icon="emojione-v1:lightning-mood" class="text-2xl" />
									</div>
									<div class="swap-off px-4"><Icon icon="openmoji:peanuts" class="text-2xl" /></div>
								</label>
								<input
									type="text"
									class="input input-bordered w-full join-item md:block hidden"
									placeholder="Add a memo"
									bind:value={memo}
								/>

								<button
									class="btn btn-outline join-item border flex-grow"
									{disabled}
									on:click={sendEcash}
								>
									{#if processing === 'sending'}
										<Icon icon="mdi:loading" class="animate-spin" />
									{:else}
										<Icon icon="mdi:send" />
									{/if}
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</VirtualList>
	</div>
</div>
