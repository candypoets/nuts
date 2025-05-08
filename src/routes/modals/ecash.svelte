<script lang="ts">
	import Icon from '@iconify/svelte';
	import MintSelector from 'src/comp/MintSelector.svelte';
	import { mintInfos } from 'src/stores/mints';
	import Avatar from '../explore/avatar.svelte';
	import User from '../explore/user.svelte';
	import { goBack } from './modal';
	import { onMount } from 'svelte';
	import { nostrManager, type SubscribeKind } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import {
		isKind10002,
		isKind10019,
		isKind17375,
		type AnyKind,
		type Kind10019Parsed
	} from 'src/parsers';
	import { activeMintUrl, balanceByMint } from 'src/controller/wallet';
	import { fly } from 'svelte/transition';
	import type { EventTemplate } from 'nostr-tools';
	import { cashuManager } from 'src/wasm/cashu';
	import { key } from 'src/stores/db';
	import { normalizeMintURL } from 'src/parsers/utils';
	import { now } from 'src/lib/period';

	// export let active: string;
	export let pubkey: string;
	let memo: string = '';

	let amount: number | undefined = undefined;

	// let invoice: string;
	// let fees: 0;
	let processing = '';

	let wallet: Kind10019Parsed;

	let zap = true;
	let receiptRelays: string[] = [];

	$: {
		if (!/^[0-9]*$/.test(amount)) {
			amount = '';
		}
	}

	$: balance = $balanceByMint[$activeMintUrl || ''];

	onMount(() => {
		nostrManager.subscribe(
			'wallet_' + pubkey,
			[
				{ kinds: [10002], authors: [pubkey], cacheFirst: true, relays: [] },
				{ kinds: [10019], authors: [pubkey], cacheFirst: true, relays: [] }
			],
			(events: ParsedEvent<AnyKind>[], eventKind: SubscribeKind) => {
				const [event, ...context] = events;
				if (isKind10019(event)) {
					console.log('ecash wallet', event);
					wallet = event?.parsed;
					zap = false;
				}
				if (isKind10002(event)) {
					receiptRelays = event.parsed?.map((r) => r.read && r.url).filter(Boolean) || [];
				}
			}
		);
	});

	const sendEcash = async () => {
		console.log('sendEcash', wallet);
		if ($activeMintUrl) {
			try {
				if (wallet && !zap) {
					const isMintSupported = wallet.trustedMints?.some(
						(tm) => normalizeMintURL(tm.url) == $activeMintUrl
					);
					const proofsToSend = await cashuManager.sendToPubkey(
						Number(amount) || 0,
						$activeMintUrl || '',
						'02' + wallet.p2pkPubkey || '',
						null,
						true
					);
					console.log(isMintSupported, proofsToSend, wallet);
					const nutszap: EventTemplate = {
						kind: 9321,
						content: memo,
						pubkey: $key?.pub,
						created_at: now(),
						tags: [
							...proofsToSend.map((proof) => ['proof', JSON.stringify(proof)]),
							['u', $activeMintUrl || ''],

							['p', pubkey]
						]
					};
					nostrManager.publish('nutszap_' + pubkey, nutszap);
				} else {
					const zapRequest: EventTemplate = {
						kind: 9734,
						content: memo,
						pubkey: $key?.pub || '',
						created_at: now(),
						tags: [
							['e', ''],
							['p', pubkey],
							['amount', (Number(amount) * 1000).toString()],
							['relays', ...receiptRelays.map((r) => r)],
							['lnurl', '']
						]
					};
					const invoice = await nostrManager.zap('zap_' + pubkey, zapRequest);
					console.log('zap invoice', invoice);
					const meltQuote = await cashuManager.requestMeltQuote(invoice, $activeMintUrl);
					console.log('meltQuote', meltQuote);
					await cashuManager.melt(meltQuote.quote);
				}
			} catch (e) {
				console.error(e);
			}
		}
	};
</script>

<div class="flex items-center h-full">
	<div class="bg-basic border rounded-xl p-4 w-feed h-full lg:h-auto">
		<div class="px-4 py-4 flex justify-between h-0 bg-basic">
			<div on:click={goBack}>
				<Icon icon="mdi:close" class="w-6 h-6" />
			</div>

			<div />
		</div>
		<div>
			<div class="p-4">
				<div class="flex gap-4 items-center">
					<div class="w-1/2 text-center">
						<MintSelector />
					</div>
					<div class="flex justify-center">
						<Icon icon="mdi:arrow-right" class="text-5xl text-gray-400" />
					</div>
					<div class="flex gap-2 items-center justify-center py-2 border-b last:border-none w-1/2">
						<!-- <Icon icon="carbon:lightning" class="w-16 h-6" />
										-->
						<Avatar {pubkey} size="lg" />
						<User {pubkey} link={false} />
					</div>
				</div>
			</div>
		</div>
		<div>
			<div class="w-full gap-3">
				<div class="h-52 flex flex-col items-center">
					<input
						autofocus
						id="send-amt"
						placeholder="0"
						type="text"
						inputmode="decimal"
						bind:value={amount}
						class="mt-10 text-7xl focus:outline-none text-center max-w-xs rounded-xl"
						on:keydown={(e) => {
							if (!!processing) return;
							if (e.key === 'Enter') {
								sendEcash();
							}
						}}
					/>
					<p />
					<p class="font-bold text-xl">Sats</p>
				</div>
			</div>

			<div class="px-4 w-full mt-36">
				<div class="join w-full">
					<label class="swap join-item border">
						<input type="checkbox" bind:checked={zap} />
						<div class="swap-on px-4">
							<Icon icon="emojione-v1:lightning-mood" class="text-2xl" />
						</div>
						<div class="swap-off px-4"><Icon icon="openmoji:peanuts" class="text-2xl" /></div>
					</label>
					<input
						type="text"
						class="input input-bordered w-full join-item"
						placeholder="Add a memo"
						bind:value={memo}
					/>

					<button
						class="btn btn-primary join-item"
						disabled={!amount || !Number(amount) || amount > balance}
						on:click={sendEcash}
					>
						{#if Number(amount) > balance}
							Not enough funds
						{:else if !!processing}
							{processing}
						{:else}
							<div class="flex items-center gap-2">
								<span class="capitalize w-40 lg:w-auto">Send</span>
							</div>
						{/if}
					</button>
				</div>
			</div>
			{#if !zap && !wallet}
				<div class="px-4 w-full mt-4" transition:fly>
					<div class="alert alert-info shadow-lg">
						<Icon
							icon="mdi:information-slab-circle-outline"
							class="stroke-current shrink-0 w-6 h-6"
						/>
						<div>
							<div class="text-sm">
								This user has not setted up an ecash wallet yet. The ecash will definitely arrive,
								but their notification experience might be a bit more low-key.
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
