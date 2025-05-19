<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { EventTemplate } from 'nostr-tools';

	import MintSelector from 'src/components/MintSelector.svelte';
	import { activeMintUrl, balanceByMint } from 'src/controller/wallet';
	import { now } from 'src/lib/period';
	import { isKind1, isKind10002, isKind10019, type AnyKind, type Kind10019Parsed } from 'src/types';
	import { normalizeMintURL } from 'src/lib/utils';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { goBack } from 'src/routes/modals/modal';
	import { cashuManager } from 'src/model/cashu';
	import { nostrManager, type Request, type SubscribeKind } from 'src/model/nostr';
	import type { Kind1Parsed, ParsedEvent } from 'src/types';
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { key } from 'src/controller';
	import Note from '../explore/note.svelte';
	import Kind1 from '../_kinds/kind1.svelte';

	// export let active: string;
	export let pubkey: string;
	export let noteId: string;
	let memo: string = '';

	let amount: number | undefined = undefined;
	let note: ParsedEvent<Kind1Parsed>;

	// let invoice: string;
	// let fees: 0;
	let processing = '';
	let scroller: HTMLElement;

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
		const requests: Request[] = [
			{ kinds: [10002], authors: [pubkey], cacheFirst: true, relays: [] },
			{ kinds: [10019], authors: [pubkey], cacheFirst: true, relays: [] }
		];
		if (noteId) requests.push({ kinds: [1], ids: [noteId], cacheFirst: true, relays: [] });
		nostrManager.subscribe(
			'wallet_' + pubkey,
			requests,
			(events: ParsedEvent<AnyKind>[], eventKind: SubscribeKind) => {
				const [event, ...context] = events;
				if (isKind10019(event)) {
					wallet = event?.parsed;
					zap = false;
				}
				if (isKind10002(event)) {
					receiptRelays = event.parsed?.map((r) => r.read && r.url).filter(Boolean) || [];
				}
				if (isKind1(event)) {
					note = event;
					tick().then((_) => scroller.scrollTo({ top: 10000 }));
				}
			}
		);
	});

	const sendEcash = async () => {
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
							['e'][('p', pubkey)]
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

<div class="flex items-center h-screen">
	<div
		class="bg-base-300 bg-opacity-85 border rounded-xl p-4 w-feed max-h-[90vh] lg:h-auto overflow-scroll scroll-auto"
		style="-webkit-overflow-scrolling: touch;"
		bind:this={scroller}
	>
		<div>
			{#if note}
				<div class="">
					<Note {note} context={[]} footer={false} showRoot={false} visible />
				</div>
			{/if}
			<div class="mx-8 mt-4 border-b border-gray-600"></div>
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
					<label class="swap join-item border bg-base-300">
						<input type="checkbox" bind:checked={zap} />
						<div class="swap-on px-4">
							<Icon icon="emojione-v1:lightning-mood" class="text-2xl" />
						</div>
						<div class="swap-off px-4"><Icon icon="openmoji:peanuts" class="text-2xl" /></div>
					</label>
					<input
						type="text"
						class="input w-full join-item"
						placeholder="Add a memo"
						bind:value={memo}
					/>

					<button
						class="btn btn-primary join-item border"
						disabled={!amount || !Number(amount) || amount > balance}
						on:click={sendEcash}
					>
						{#if Number(amount) > balance}
							Not enough funds
						{:else if !!processing}
							{processing}
						{:else}
							<div class="flex items-center gap-2">
								<span class="capitalize w-40 lg:w-auto text-white">Send</span>
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
