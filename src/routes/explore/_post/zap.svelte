<script lang="ts">
	import {
		Kind9321Parsed,
		MessageType,
		ParsedData,
		type Kind9735Parsed,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind9321, asKind9735, asParsedEvent } from '@candypoets/nipworker/utils';
	import { sortBy, uniqBy } from 'lodash';
	import { onDestroy } from 'svelte';

	import { kind0 } from 'src/controller/nostr';
	import { getRelaysFromNote } from 'src/lib/getRelaysFromNote';
	import { getUserRelays } from 'src/routes/queries/user';
	import Avatar from '../avatar.svelte';
	import Icon from '@iconify/svelte';
	import { isMobile } from 'src/controller';

	export let note: ParsedEvent;
	export let visible: boolean;

	let timeout: NodeJS.Timeout | undefined;

	let zaps: (Kind9735Parsed | Kind9321Parsed)[] = [];
	let nuts: Kind9321Parsed[] = [];
	let zapped = false;
	let biggestZap: Kind9735Parsed;
	let biggestNut: Kind9321Parsed;
	let totalZapAmount = 0;
	let totalNutAmount = 0;
	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	$: relays = getRelaysFromNote(note);

	let subed = 0;

	async function subscribe() {
		timeout = setTimeout(() => {
			if (visible && !relaysub) {
				subed++;
				relaysub = getUserRelays(note.pubkey()!, (result) => {
					relays = result.slice(0, $isMobile ? 3 : 5);
					sub = useSubscription(
						'z_' + note.id(),
						[
							{
								kinds: [9735, 9321],
								tags: { '#e': [note.id()!] },
								noContext: true,
								limit: 100,
								since: note.createdAt(),
								relays: relays || []
							}
						],
						handleEvents
					);
				});
			}
		}, 1000);
	}

	const handleEvents = (message: WorkerMessage) => {
		switch (message.type()) {
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (parsedEvent) {
					switch (parsedEvent?.parsedType()) {
						case ParsedData.Kind9735Parsed:
							handleZaps(parsedEvent);
							break;
						case ParsedData.Kind9321Parsed:
							handleNuts(parsedEvent);
							break;
					}
				}
				break;
		}
	};

	function handleNuts(event: ParsedEvent) {
		const kind9321 = asKind9321(event) as Kind9321Parsed;
		if (event.pubkey() == $kind0?.pubkey()) zapped = true;
		totalZapAmount += kind9321?.amount() || 0;

		biggestNut = (kind9321?.amount() || 0) > (biggestNut?.amount() || 0) ? kind9321 : biggestNut;
		zaps = sortBy(
			uniqBy([...zaps, kind9321], (z) => z?.id()),
			(n) => n?.amount()
		);
	}

	function handleZaps(event: ParsedEvent) {
		const kind9735 = asKind9735(event) as Kind9735Parsed;
		if (event.pubkey() == $kind0?.pubkey()) zapped = true;
		totalZapAmount += kind9735?.amount() || 0;
		biggestZap = (kind9735?.amount() || 0) > (biggestZap?.amount() || 0) ? kind9735 : biggestZap;
		zaps = sortBy(
			uniqBy([...zaps, kind9735], (z) => z?.id()),
			(z) => z?.amount()
		);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			sub?.();
			relaysub?.();
			subed--;
		}
	}

	onDestroy(unsubscribe);

	$: visible ? subscribe() : unsubscribe();
</script>

{#if zaps.length > 0}
	<!-- <div class="flex flex-col"> -->
	<!-- Zap summary showing total amount -->

	<!-- Zappers visualization -->
	<div class={'flex items-center w-full justify-end pl-10 ' + $$props.class}>
		{#if zaps.length > 0}
			<!-- Other zappers with overlapping profile pictures -->
			<div class="flex items-center flex-grow gap-1">
				<div class="text-xs items-center flex mr-1">
					<Icon icon="bitcoin-icons:satoshi-v2-filled" class="text-xl font-bold" />
					{totalZapAmount.toLocaleString()}
				</div>
				<div class="flex -space-x-2 items-center">
					{#each zaps.slice(0, 5) as zap (zap.id())}
						<Avatar pubkey={zap?.sender()} />
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
		{#if biggestZap || biggestNut}
			{#if (biggestZap?.amount() || 0) >= (biggestNut?.amount() || 0)}
				{@const comment = biggestZap.content()}
				{@const sender = biggestZap?.sender()}
				<!-- Biggest zapper on the left -->
				<div class="flex shrink-0 items-center text-sm">
					<div class="text-xs font-bold px-1 rounded-full">
						{biggestZap?.amount()} ⚡
					</div>
					<!-- Zap amount badge for the biggest zapper -->
					<!-- </div> -->

					<!-- Zap comment from biggest zapper if any -->
					{#if comment}
						<div class="px-2 py-1 max-w-40 overflow-hidden text-ellipsis whitespace-nowrap">
							"{comment}"
						</div>
					{/if}
					<Avatar pubkey={sender} size="sm" />
				</div>
			{:else}
				{@const comment = biggestNut.comment()}
				{@const sender = biggestNut?.sender()}
				<!-- Biggest zapper on the left -->
				<div class="flex shrink-0 items-center text-sm">
					<div class="text-xs font-bold px-1 rounded-full">
						{biggestNut?.amount()} 🥜
					</div>
					<!-- Zap amount badge for the biggest zapper -->
					<!-- </div> -->

					<!-- Zap comment from biggest zapper if any -->
					{#if comment}
						<div class="px-2 py-1 max-w-40 overflow-hidden text-ellipsis whitespace-nowrap">
							"{comment}"
						</div>
					{/if}
					<Avatar pubkey={sender} size="sm" />
				</div>
			{/if}
		{/if}
	</div>
	<!-- </div> -->
{/if}
