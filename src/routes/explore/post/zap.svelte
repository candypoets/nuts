<script lang="ts">
	import _ from 'lodash';
	import { handler } from 'src/handlers';
	import NIP57Worker from 'src/workers/nip57?worker';
	import NIP61Worker from 'src/workers/nip61?worker';
	import type { Nip57Params, NIP57Parsed } from 'src/workers/nip57';
	import type { Nip61Params, NIP61Parsed } from 'src/workers/nip61';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import Avatar from '../avatar.svelte';
	import type { Kind0Parsed } from 'src/parsers';

	export let note: ParsedEvent<any>;
	export let visible: boolean;

	let nip57: Worker;
	let nip61: Worker;
	let timeout: NodeJS.Timeout | undefined;

	let profile: Writable<Kind0Parsed | null> = getContext('profile');

	let zaps: ParsedEvent<NIP57Parsed>[] = [];
	let nuts: ParsedEvent<NIP61Parsed>[] = [];
	let zapped = false;
	let biggestZap: ParsedEvent<NIP57Parsed>;
	let totalZapAmount = 0;
	let totalNutAmount = 0;

	async function subscribe() {
		timeout = setTimeout(async () => {
			if (visible) {
				// handle zaps
				// handleZaps();
				// handleNuts();
			}
		}, 100);
	}

	async function handleNuts() {
		if (!nip61) nip61 = new NIP61Worker();
		nip61.postMessage({
			zaps: { '#e': [note.id], since: note.created_at, relays: note.relays },
			wallet: { authors: [note.pubkey], relays: note.relays }
		} as Nip61Params);

		for await (const data of handler<NIP61Parsed>(nip61, false)) {
			if (data.kind == 9321) {
				console.log('A NUT', data);
				if (!data.parsed) continue;
				if (data.pubkey == $profile?.pubkey) zapped = true;
				if (nuts.some((n) => n.id == data.id)) continue;
				totalNutAmount += data.parsed.amount;
			}
			// biggestNut = data.parsed.amount > (biggestNut?.parsed?.amount || 0) ? data : biggestNut;
			// // filter out deep replies
			// nuts = _.sortBy([...nuts, data], (n) => n.parsed?.amount);
		}
	}

	async function handleZaps() {
		if (!nip57) nip57 = new NIP57Worker();
		nip57.postMessage({
			'#e': [note.id],
			since: note.created_at,
			relays: note.relays
		} as Nip57Params);

		for await (const data of handler<NIP57Parsed>(nip57)) {
			console.log('zaps', data);
			if (!data.parsed) continue;
			if (data.pubkey == $profile?.pubkey) zapped = true;
			if (zaps.some((z) => z.id == data.id)) continue;
			totalZapAmount += data.parsed.amount;
			biggestZap = data.parsed.amount > (biggestZap?.parsed?.amount || 0) ? data : biggestZap;
			// filter out deep replies
			zaps = _.sortBy([...zaps, data], (z) => z.parsed?.amount);
		}
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		// nip57?.postMessage({ type: 'UNSUBSCRIBE' });
		// nip57?.terminate();
		// nip57 = undefined;

		// nip61?.postMessage({ type: 'UNSUBSCRIBE' });
		// nip61?.terminate();
		// nip61 = undefined;
	}

	onMount(() => {
		return () => {
			// nip57?.postMessage({ type: 'UNSUBSCRIBE' });
			// nip57?.terminate();
			// nip61?.postMessage({ type: 'UNSUBSCRIBE' });
			// nip61?.terminate();

			unsubscribe();
		};
	});

	$: visible ? subscribe() : unsubscribe();
</script>

{#if zaps.length > 0}
	<!-- <div class="flex flex-col"> -->
	<!-- Zap summary showing total amount -->

	<!-- Zappers visualization -->
	<div class="flex items-center w-full justify-end pl-10">
		{#if zaps.length > 0}
			<!-- Other zappers with overlapping profile pictures -->
			<div class="flex items-center flex-grow gap-1">
				<div class="text-xs text-gray-500 items-center">
					{zaps.length}
					{zaps.length === 1 ? 'zap' : 'zaps'} · {totalZapAmount.toLocaleString()} sats
				</div>
				<div class="flex -space-x-2 items-center">
					{#each zaps.slice(0, 5) as zap, i}
						<Avatar pubkey={zap?.parsed?.sender} />
					{/each}

					<!-- If there are more than 5 zappers, show a "+X more" badge -->
					{#if zaps.length > 5}
						<div
							class="px-2 text-gray-800 rounded-full bg-gray-200 flex items-center justify-center border border-white text-xs font-bold"
						>
							+{zaps.length - 5}
						</div>
					{/if}
				</div>
			</div>
			<!-- <!-- Line separating biggest zapper from others -->
			<!-- <div class="w-full flex-grow border-t border-gray-300 mx-2"></div> -->
		{/if}

		{#if biggestZap}
			<!-- Biggest zapper on the left -->
			<div class="flex shrink-0 items-center text-sm">
				<div class="text-xs font-bold px-1 rounded-full">
					{biggestZap.parsed?.amount} ⚡
				</div>
				<!-- Zap amount badge for the biggest zapper -->
				<!-- </div> -->

				<!-- Zap comment from biggest zapper if any -->
				{#if biggestZap.parsed?.content}
					<div class="px-2 py-1 max-w-40 overflow-hidden text-ellipsis whitespace-nowrap">
						"{biggestZap.parsed.content}"
					</div>
				{/if}
				<Avatar pubkey={biggestZap?.parsed?.sender} size="sm" />
			</div>
		{/if}
	</div>
	<!-- </div> -->
{/if}
