<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { EventTemplate } from 'nostr-tools';
	import { getContext, onMount, tick } from 'svelte';

	import MintSelector from 'src/components/MintSelector.svelte';
	import VirtualList from 'src/components/VirtualList.svelte';
	import { key, kind17375 } from 'src/controller';
	import { activeMintUrl } from 'src/controller/wallet';
	import { now } from 'src/lib/period';
	import { getInvoiceFromProfile, GetLNURLFromProfile } from 'src/lib/wallet';
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

	$: {
		if (!/^[0-9]*$/.test(amount)) {
			amount = '';
		}
	}

	let balanceByMint = $nutsWallet?.balanceByMint;

	let fromMint = $activeMintUrl || ($kind17375 && asKind17375($kind17375)?.mints(0)?.toString());
	let toMint: string;
	let fees: number = 0;
	let meltquote: MeltQuoteResponse;
	let mintquote: MintQuoteResponse;

	const resetState = () => {
		fees = 0;
		meltquote = undefined;
		mintquote = undefined;
		processing = '';
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
							break;
					}
				}
			});
		});
	});

	const computeFees = throttle(async (amount: number, fromMint: string, toMint: string) => {
		if (fromMint && toMint && amount && toMint != fromMint) {
			// attempt a swap to a supported mint before sending
			const fromWallet = await $nutsWallet?.getWallet(fromMint);
			const toWallet = await $nutsWallet?.getWallet(toMint);
			if (toWallet && fromWallet && kind10019?.p2pkPubkey) {
				mintquote = await toWallet.createMintQuote(amount, kind10019.p2pkPubkey()?.toString());
				meltquote = await fromWallet.createMeltQuote(mintquote.request);
				fees = meltquote.fee_reserve;
			}
		} else {
			meltquote = undefined;
			fees = 0;
		}
	}, 300);

	$: computeFees(amount, fromMint, toMint);

	const sendEcash = async () => {
		let sendStatus: { [url: string]: ConnectionStatus } = {};
		if (!fromMint) return;
		processing = 'true';
		const fromWallet = await $nutsWallet?.getWallet(fromMint);
		const unspentProofs = fromWallet && $nutsWallet?.unspentProofs.get(fromMint);
		console.log('send ecash', fromWallet, fromMint, unspentProofs, $nutsWallet?.unspentProofs);
		if (
			meltquote &&
			unspentProofs &&
			amount &&
			fromMint &&
			toMint &&
			$nutsWallet &&
			fromMint != toMint
		) {
			status = 'Swap from ' + fromMint + ' to ' + toMint;
			const toWallet = await $nutsWallet.getWallet(toMint);
			console.log(toWallet, amountPlusFees, unspentProofs);
			const { keep, send } = fromWallet?.selectProofsToSend(unspentProofs, amountPlusFees, true);
			console.log('hi');
			const { change } = await fromWallet.meltProofs(meltquote, send);
			console.log('hoy');
			try {
				let response = await toWallet?.checkMintQuote(mintquote.quote);
				while (response.state !== MintQuoteState.PAID) {
					status = 'Waiting for mint quote to be paid...';
					await new Promise((resolve) => setTimeout(resolve, 1000));
					response = await toWallet?.checkMintQuote(mintquote.quote);
				}

				const proofsToSend = await toWallet.mintProofs(amount, mintquote.quote);

				status = 'Swap successful';

				const sendRes = await toWallet.send(Number(amount), proofsToSend, {
					includeFees: false,
					p2pk: { pubkey: kind10019.p2pkPubkey()?.toString() as string }
				});

				const nutszap: EventTemplate = {
					kind: 9321,
					content: memo,
					created_at: now(),
					tags: [
						...sendRes.send.map((proof) => ['proof', JSON.stringify(proof)]),
						['u', toMint || ''],
						['e', noteId || ''],
						['p', pubkey]
					].filter((t) => !!t[1])
				};
				status = 'Success!! Publishing nutszap';
				const sendId = 'nutszap_' + random(1000);
				usePublish(sendId, nutszap, (message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					if (status) {
						const relayUrl = status.relayUrl()?.toString();
						if (relayUrl) {
							sendStatus[relayUrl] = status;
							updateSendStatus(sendId, sendStatus);
						}
					}
				});
				setTimeout(() => (status = ''), 1000);
			} finally {
				$nutsWallet?.unspentProofs.set(fromMint, keep.concat(change));
				$nutsWallet.updateBalanceByMint();
				$nutsWallet.saveProofs(fromMint, keep.concat(change));
			}
		} else if (fromMint == toMint && fromWallet && unspentProofs) {
			const { keep, send } = await fromWallet.send(Number(amount), unspentProofs, {
				p2pk: { pubkey: kind10019?.p2pkPubkey()?.toString() }
			});

			const nutszap: EventTemplate = {
				kind: 9321,
				content: memo,
				created_at: now(),
				tags: [
					...send.map((proof) => ['proof', JSON.stringify(proof)]),
					['u', $activeMintUrl || ''],
					['e', noteId || ''],
					['p', pubkey]
				].filter((t) => !!t[1])
			};
			console.log(nutszap);
			status = 'Success!! Publishing nutszap';
			const sendId = 'nutszap_' + random();
			usePublish(sendId, nutszap, (message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl()?.toString();
					if (relayUrl) {
						sendStatus[relayUrl] = status;
						updateSendStatus(sendId, sendStatus);
					}
				}
			});
			setTimeout(() => (status = ''), 1000);
			$nutsWallet?.unspentProofs.set(fromMint, keep);
			$nutsWallet?.updateBalanceByMint();
			$nutsWallet?.saveProofs(fromMint, keep);
		} else if (fromMint && fromWallet && unspentProofs) {
			const lnurl = GetLNURLFromProfile(kind0);
			const zapRequest: EventTemplate = {
				kind: 9734,
				content: memo,
				pubkey: $key?.pub || '',
				created_at: now(),
				tags: [
					['e', noteId || ''],
					['p', pubkey],
					['amount', (Number(amount) * 1000).toString()],
					['relays', ...receiptRelays.map((r) => r)],
					['lnurl', lnurl || '']
				].filter((t) => !!t[1])
			};
			status = 'Signing zap request';
			// const signed = await nostrManager.signEvent(zapRequest);

			useSignEvent(zapRequest, async (signed) => {
				status = 'Generate zap invoice';
				const { pr } = await getInvoiceFromProfile(kind0, Number(amount), signed);
				status = 'Generate melt quote';
				meltquote = await fromWallet.createMeltQuote(pr);
				status = 'Sending lighning payment';
				// const { keep, send } = await fromWallet.swap(0, unspentProofs);
				// console.log(keep, send);
				// if (keep.length) {
				// 	$nutsWallet?.saveProofs(fromMint, keep);
				// } else {
				// 	$nutsWallet?.saveProofs(fromMint, send);
				// }
				const { change } = await fromWallet.meltProofs(meltquote, unspentProofs);
				status = 'Success! Publishing zap request';
				const sendId = 'zap' + pubkey;
				usePublish(sendId, zapRequest, (message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					if (status) {
						const relayUrl = status.relayUrl()?.toString();
						if (relayUrl) {
							sendStatus[relayUrl] = status;
							updateSendStatus(sendId, sendStatus);
						}
					}
				});
				setTimeout(() => (status = 'ZAPPED'), 1000);
				setTimeout(() => (status = ''), 1000);
				$nutsWallet?.unspentProofs.set(fromMint, change);
				$nutsWallet?.updateBalanceByMint();
				$nutsWallet?.saveProofs(fromMint, change);
			});
		}

		resetState();
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
								<div class="md:mt-10 w-1/2 text-center text-primary p-4">
									{status}
								</div>
							{/if}
						</div>
					</div>
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
								disabled={!amount || !Number(amount) || amountPlusFees > balance || !!status}
								on:click={sendEcash}
							>
								{#if Number(amountPlusFees) > balance}
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
