<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { EventTemplate } from 'nostr-tools';
	import { get, writable } from 'svelte/store';
	import { getContext, onDestroy, onMount, tick } from 'svelte';

	import MintSelector from 'src/components/MintSelector.svelte';
	import VirtualList from 'src/components/VirtualList.svelte';
	import { key, kind17375 } from 'src/controller';
	import { activeMintUrl, validateP2pkPubkey } from 'src/controller/wallet';
	import { now } from 'src/lib/period';
	import { getInvoiceFromProfile, GetLNURLFromProfile, getZapInvoice } from 'src/lib/wallet';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';

	import {
		ConnectionStatus,
		Kind10002Parsed,
		ParsedData,
		WorkerMessage,
		type Kind10019Parsed,
		type ParsedEvent,
		type RequestObject
	} from '@candypoets/nipworker';
	import { usePublish, useSignEvent, useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind10002,
		asKind10019,
		asKind17375,
		fbArray,
		isConnectionStatus,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import { MintQuoteState, type MeltQuoteResponse, type MintQuoteResponse } from '@cashu/cashu-ts';
	import { random, throttle } from 'lodash';
	import { nutsWallet } from 'src/controller/proofs';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { fly } from 'svelte/transition';
	import { getUserRelays } from '../queries/user';
	import Zap from '../explore/_post/zap.svelte';

	// Transaction recovery imports
	import {
		startTransaction,
		advanceTransaction,
		abortTransaction,
		activeTxIdStore,
		loadTxState,
		type TxState,
		type TxType
	} from 'src/model/cashu/tx-recovery';

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

	let status = '';

	// Transaction recovery state
	let activeTxId: string | null = null;
	let txState: TxState | null = null;
	let txUnsubscribe: (() => void) | null = null;
	let isResuming = false;
	let lastError = '';

	// Subscribe to active transaction changes
	$: {
		if (txUnsubscribe) txUnsubscribe();
		txUnsubscribe = activeTxIdStore.subscribe(async (txId) => {
			activeTxId = txId;
			if (txId) {
				txState = await loadTxState(txId);
				isResuming = true;
				updateStatusFromTxState();
			} else {
				txState = null;
				isResuming = false;
				lastError = '';
			}
		});
	}

	onDestroy(() => {
		if (txUnsubscribe) txUnsubscribe();
	});

	// Update UI status based on transaction state
	function updateStatusFromTxState() {
		if (!txState) return;
		
		// Map transaction steps to user-friendly status messages
		const stepMessages: Record<string, string> = {
			init: 'Initializing...',
			reserve_proofs: 'Reserving proofs...',
			build_nutszap_event: 'Building nutszap...',
			publish_nutszap_event: 'Publishing...',
			get_melt_quote: 'Getting quote...',
			perform_melt: 'Melting tokens...',
			get_mint_quote: 'Getting mint quote...',
			perform_mint: 'Minting tokens...',
			build_zap_request: 'Building zap request...',
			fetch_zap_invoice: 'Fetching invoice...',
			store_change_proofs: 'Storing change...',
			finalize: 'Finalizing...'
		};
		
		status = stepMessages[txState.step] || `Processing: ${txState.step}...`;
		
		// Calculate progress based on step
		const stepProgress: Record<string, number> = {
			init: 0,
			reserve_proofs: 0.1,
			build_nutszap_event: 0.3,
			publish_nutszap_event: 0.7,
			get_melt_quote: 0.2,
			perform_melt: 0.4,
			get_mint_quote: 0.5,
			perform_mint: 0.6,
			build_zap_request: 0.2,
			fetch_zap_invoice: 0.4,
			store_change_proofs: 0.8,
			finalize: 0.9
		};
		progress = stepProgress[txState.step] || 0.5;
		
		// Show last error if any
		if (txState.errors && txState.errors.length > 0) {
			const lastErr = txState.errors[txState.errors.length - 1];
			lastError = lastErr.message;
		}
		
		// Check if transaction is complete
		if (txState.isFinalized) {
			status = 'Success!';
			progress = 1;
			isResuming = false;
			setTimeout(() => {
				// Check if no new transaction started
				const currentActive = get(activeTxIdStore);
				if (currentActive === null) {
					status = '';
					resetState();
				}
			}, 2000);
		}
	}

	// Poll transaction state for UI updates
	let txPollInterval: ReturnType<typeof setInterval> | null = null;
	
	$: if (activeTxId && isResuming) {
		if (txPollInterval) clearInterval(txPollInterval);
		txPollInterval = setInterval(async () => {
			if (activeTxId) {
				txState = await loadTxState(activeTxId);
				updateStatusFromTxState();
			}
		}, 500);
	} else {
		if (txPollInterval) {
			clearInterval(txPollInterval);
			txPollInterval = null;
		}
	}

	onDestroy(() => {
		if (txPollInterval) clearInterval(txPollInterval);
	});

	// Abort the current transaction
	const handleAbort = async () => {
		if (!activeTxId) return;
		try {
			processing = 'aborting';
			await abortTransaction(activeTxId);
			status = 'Transaction aborted';
			setTimeout(() => {
				status = '';
				resetState();
			}, 2000);
		} catch (err) {
			status = 'Abort failed: ' + (err as Error).message;
			setTimeout(() => (status = ''), 3000);
		} finally {
			processing = '';
		}
	};

	$: {
		if (!/^[0-9]*$/.test(amount)) {
			amount = '';
		}
	}

	let progress = 0.9;

	let balanceByMint = $nutsWallet?.balanceByMint;

	let fromMint = $activeMintUrl || ($kind17375 && asKind17375($kind17375)?.mints(0)?.toString());
	let toMint: string;
	let fees: number;
	let meltquote: MeltQuoteResponse;
	let mintquote: MintQuoteResponse;

	const resetState = () => {
		fees = undefined;
		meltquote = undefined;
		mintquote = undefined;
		processing = '';
		// status = '';
		progress = 0;
	};

	$: balance = $balanceByMint?.[fromMint || ''];
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
							computeFees(amount, fromMint, toMint);
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
		!amount || !Number(amount) || amountPlusFees > balance || !!status || (!kind10019 && !lnurl) || !!activeTxId;

	$: if (!lnurl) {
		status = 'This user has not set up their profile for zaps.';
	} else {
		status = '';
	}

	const sendEcash = async () => {
		if (!fromMint || !$nutsWallet) return;
		
		processing = 'starting';
		
		try {
			// Determine transaction type based on current state
			let txType: TxType;
			if (zap && lnurl) {
				txType = 'zap';
			} else if (fromMint !== toMint && toMint && !zap) {
				txType = 'nutszap-melt';
			} else {
				txType = 'nutszap';
			}
			
			// Build transaction parameters
			const params = {
				fromMint,
				toMint: toMint || undefined,
				pubkey,
				amount: Number(amount),
				feeReserve: fees || 0,
				memo,
				noteId: noteId || undefined,
				lnurl: lnurl || undefined,
				p2pkPubkey: kind10019?.p2pkPubkey()?.toString(),
				receiptRelays: receiptRelays.length > 0 ? receiptRelays : undefined
			};
			
			// Start the transaction - this will reserve proofs
			const txId = await startTransaction(txType, params);
			console.log(`[ecash] Started ${txType} transaction: ${txId}`);
			
			// Begin transaction advancement (non-blocking)
			advanceTransaction(txId).catch((err) => {
				console.error('[ecash] Transaction failed:', err);
				status = 'Error: ' + (err as Error).message;
			});
			
			// The UI will update via the txState subscription
			processing = '';
			
		} catch (err) {
			console.error('[ecash] Failed to start transaction:', err);
			status = 'Error: ' + (err as Error).message;
			processing = '';
			setTimeout(() => (status = ''), 3000);
		}
	};
</script>

<svelte:window
	on:keydown={(e) => {
		// Command (Meta) + Enter or Ctrl + Enter
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			// Mirror disabled conditions
			if (!!processing) return;
			if (!amount || !Number(amount) || amountPlusFees > (balance || 0) || !!status || !!activeTxId) return;

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
				</div>
				<div>
					<div class="w-full gap-3">
						<div class="md:h-52 flex flex-col items-center">
							{#if !status}
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
								<div class="flex flex-col items-center gap-4">
									<!-- Resuming banner -->
									{#if isResuming}
										<div class="alert alert-warning shadow-lg w-full max-w-md" transition:fly>
											<Icon icon="mdi:refresh" class="animate-spin text-xl" />
											<span>Resuming transaction...</span>
										</div>
									{/if}
									
									<div
										class="md:mt-4 w-1/2 text-center text-primary p-4 border border-primary-content rounded-lg relative overflow-hidden"
									>
										<div
											class="absolute bg-gradient-to-r to-bg-base-300 from-primary-content h-full top-0 left-0 transition-all"
											style="width: {progress * 100}%"
										/>
										<div class="relative z-30">
											{status}
											<span class="inline-flex ml-1">
												<span class="animate-pulse text-lg">.</span>
												<span class="animate-pulse text-lg" style="animation-delay: 0.2s">.</span>
												<span class="animate-pulse text-lg" style="animation-delay: 0.4s">.</span>
											</span>
										</div>
									</div>
									
									<!-- Show last error if any -->
									{#if lastError}
										<div class="text-error text-sm max-w-md text-center" transition:fly>
											Error: {lastError}
										</div>
									{/if}
									
									<!-- Abort button for stuck transactions -->
									{#if activeTxId}
										<button
											class="btn btn-error btn-sm"
											on:click={handleAbort}
											disabled={processing === 'aborting'}
										>
											{#if processing === 'aborting'}
												<Icon icon="mdi:loading" class="animate-spin mr-2" />
												Aborting...
											{:else}
												<Icon icon="mdi:close-circle" class="mr-2" />
												Cancel Transaction
											{/if}
										</button>
									{/if}
								</div>
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
								{#if processing}
									{processing}
								{:else if Number(amountPlusFees) > balance}
									Not enough funds
								{:else if !!status}
									Sending...
								{:else}
									<div class="flex items-center gap-2">
										<span class="capitalize w-40 lg:w-auto text-white">Send</span>
									</div>
								{/if}
							</button>
						</div>
					</div>
					{#if !zap && !kind10019}
						<div class="px-4 w-full mt-4" transition:fly>
							<div class="alert alert-info shadow-lg">
								<Icon
									icon="mdi:information-slab-circle-outline"
									class="stroke-current shrink-0 w-6 h-6"
								/>
								<div>
									<div class="text-sm">
										This user has not setted up an ecash wallet yet. The ecash will definitely
										arrive, but their notification experience might be a bit more low-key.
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</VirtualList>
	</div>
</div>
