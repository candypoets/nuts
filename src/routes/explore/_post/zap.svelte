<script lang="ts">
	import type { AnyKind, Kind9321Parsed, Kind9735Parsed, ParsedEvent } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isKind9321, isKind9735 } from '@candypoets/nipworker/utils';
	import _ from 'lodash';
	import { onDestroy } from 'svelte';

	import { kind0 } from 'src/controller/nostr';
	import { getRelaysFromNote } from 'src/lib/getRelaysFromNote';
	import { getUserRelays } from 'src/routes/queries/user';
	import Avatar from '../avatar.svelte';

	export let note: ParsedEvent<any>;
	export let visible: boolean;

	let timeout: NodeJS.Timeout | undefined;

	let zaps: ParsedEvent<Kind9735Parsed>[] = [];
	let nuts: ParsedEvent<Kind9321Parsed>[] = [];
	let zapped = false;
	let biggestZap: ParsedEvent<Kind9735Parsed>;
	let totalZapAmount = 0;
	let totalNutAmount = 0;
	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	$: relays = getRelaysFromNote(note);

	async function subscribe() {
		timeout = setTimeout(() => {
			if (visible && !relaysub) {
				relaysub = getUserRelays(note.pubkey, (result) => {
					relays = result;
					sub = useSubscription(
						'z_' + note.id,
						[
							{
								kinds: [9735, 9321],
								tags: { '#e': [note.id] },
								noContext: true,
								limit: 100,
								since: note.created_at,
								relays: relays || []
							}
						],
						handleEvents
					);
				});
			}
		}, 200);
	}

	const handleEvents = (events: ParsedEvent<AnyKind>[]) => {
		const event = events[0];
		if (isKind9735(event)) {
			handleZaps(event);
		} else if (isKind9321(event)) {
			handleNuts(event);
		}
	};

	function handleNuts(event: ParsedEvent<Kind9321Parsed>) {
		if (!event.parsed) return;
		console.log('nuts');
		if (event.pubkey == $kind0?.pubkey) zapped = true;
		if (nuts.some((n) => n.id == event.id)) return;
		totalNutAmount += event.parsed.amount;

		// biggestNut = data.parsed.amount > (biggestNut?.parsed?.amount || 0) ? data : biggestNut;
		// // filter out deep replies
		// nuts = _.sortBy([...nuts, data], (n) => n.parsed?.amount);
	}

	function handleZaps(event: ParsedEvent<Kind9735Parsed>) {
		if (!event.parsed) return;
		if (event.pubkey == $kind0?.pubkey) zapped = true;
		if (zaps.some((z) => z.id == event.id)) return;
		totalZapAmount += event.parsed.amount;
		biggestZap = event.parsed.amount > (biggestZap?.parsed?.amount || 0) ? event : biggestZap;
		// filter out deep replies
		zaps = _.sortBy([...zaps, event], (z) => z.parsed?.amount);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			sub?.();
			relaysub?.();
		}
	}

	onDestroy(unsubscribe);

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
				<div class="text-xs items-center">
					{zaps.length}
					{zaps.length === 1 ? 'zap' : 'zaps'} · {totalZapAmount.toLocaleString()} sats
				</div>
				<div class="flex -space-x-2 items-center">
					{#each zaps.slice(0, 5) as zap, i (zap.id)}
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
