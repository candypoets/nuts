<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import _ from 'lodash';
	import { getContext, onMount } from 'svelte';

	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/types';
	import { nostrManager, type SubscribeKind } from 'src/model/nostr';
	import type { Kind1Parsed, ParsedEvent } from 'src/types';

	export let note: ParsedEvent<Kind1Parsed>;
	export let context: ParsedEvent<AnyKind>[] = [];
	export let depth = 0;

	export let oneline: boolean = true;

	let author: Kind0Parsed | undefined;
	let isImageContext = getContext('imageContext');
	let sub: () => void;

	onMount(() => {
		if (!author) {
			author = context.find((c) => c.pubkey === note.pubkey && c.kind == 0)?.parsed as
				| Kind0Parsed
				| undefined;
			if (!author) {
				sub = nostrManager.subscribe(
					'header_' + note.pubkey + '_' + _.random(10000),
					[{ kinds: [0], authors: [note.pubkey], limit: 1, cacheFirst: true, relays: [] }],
					(events: ParsedEvent<AnyKind>[], type: SubscribeKind) => {
						if (type == 'EOSE') {
							console.log('eose', events);
							return;
						}
						const [event, ...context] = events;
						if (isKind0(event)) {
							author = event.parsed as Kind0Parsed;
							sub();
						}
					}
				);
			}
		}
		return () => sub?.();
	});

	$: {
		if (!author && context) {
			author = context.find((c) => c.pubkey === note.pubkey && c.kind == 0)?.parsed as
				| Kind0Parsed
				| undefined;
			author && sub?.();
		}
	}

	function go() {
		if (isImageContext) return;
		const currentPath = $page.url.pathname;
		const profilePath = `nprofile:${note.pubkey}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(profilePath)) {
			goto(`${currentPath}/${profilePath}`);
		}
	}
</script>

<div class="flex gap-2 relative" class:!gap-1={!!depth}>
	<div class="w-8 min-w-8" class:!w-6={!!depth} class:!min-w-6={!!depth}>
		<a on:click|stopPropagation|preventDefault={go} class="cursor-pointer">
			<img
				src={author?.picture || '/ns-naked.svg'}
				alt={author?.name}
				class="border w-8 h-8 rounded-full space-x-4 mx-auto z-10 object-cover"
				class:!w-6={!!depth}
				class:!h-6={!!depth}
			/>
		</a>
	</div>
	<div class="w-full">
		<div class="flex items-start" class:flex-wrap={isImageContext} class:items-center={oneline}>
			{#if oneline}
				<a on:click|stopPropagation|preventDefault={go} class="hover:underline cursor-pointer">
					<div class="whitespace-nowrap overflow-hidden text-ellipsis font-semibold">
						{author?.name || note?.pubkey?.slice(0, 15) + '...'}
					</div>
				</a>
				{#if author?.nip05}
					<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
					<p class="text-xs opacity-50">{author?.nip05}</p>
				{/if}
			{:else}
				<div class="flex-grow">
					<div class="flex items-center">
						<a on:click|stopPropagation|preventDefault={go} class="hover:underline cursor-pointer">
							<div class="whitespace-nowrap overflow-hidden text-ellipsis">
								{author?.name || note.pubkey.slice(0, 15) + '...'}
							</div>
						</a>
						<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
						<p class="text-xs opacity-50 ml-2">
							{formatDistanceToNow(note.created_at, { addSuffix: true })}
						</p>
					</div>
					{#if author?.nip05}
						<p class="text-xs opacity-50">{author?.nip05}</p>
					{/if}
				</div>
			{/if}
			{#if oneline && note?.created_at}
				<p class="text-xs opacity-50 ml-2">
					{formatDistanceToNow((note?.created_at || 0) * 1000, { addSuffix: true })}
				</p>
			{/if}
		</div>
	</div>
</div>
