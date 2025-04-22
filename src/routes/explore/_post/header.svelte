<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import _ from 'lodash';
	import { signAndSend } from 'src/actions/relay';
	import { kind0, kind3 } from 'src/controller/nostr';
	import { now } from 'src/lib/period';
	import type { AnyKind, Kind0Parsed } from 'src/parsers';
	import { key } from 'src/stores/db';
	import { signer } from 'src/stores/signer';
	import type { NIP10Parsed } from 'src/workers/nip10';
	import type { ParsedEvent } from 'src/workers/nipworker';

	export let note: ParsedEvent<NIP10Parsed>;
	export let context: ParsedEvent<AnyKind>[] = [];
	export let depth = 0;

	export let oneline: boolean = true;

	let author: Kind0Parsed | undefined;

	$: {
		if (!author) {
			author = context.find((c) => c.pubkey === note.pubkey && c.kind == 0)?.parsed as
				| Kind0Parsed
				| undefined;
		}
	}

	function go() {
		const currentPath = $page.url.pathname;
		const profilePath = `nprofile:${note.pubkey}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(profilePath)) {
			goto(`${currentPath}/${profilePath}`);
		}
	}

	function updateFollowList() {
		if (!$kind0 || !author) return;
		signAndSend($signer, {
			kind: 3,
			pubkey: $key?.pub,
			created_at: now(),
			tags: _.uniqBy(
				[
					...($kind3?.parsed || []).map((c) => [['p', c.pubkey, c.relays?.[0]]]),
					[['p', author.pubkey, author.relays?.[0]]]
				],
				(c) => c[0][1]
			).filter((c) =>
				($kind3?.parsed || []).some((c) => c.pubkey === author?.pubkey)
					? c[0][1] !== author?.pubkey
					: true
			),
			content: ''
		});
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
		<div class="flex items-start" class:items-center={oneline}>
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
			{#if !oneline}
				<div class="flex-grow text-right w-full pr-4">
					<button class="btn btn-primary btn-xs" on:click={updateFollowList}>
						{!($kind3?.parsed || []).some((c) => c.pubkey === note?.pubkey) ? 'Follow' : 'Unfollow'}
					</button>
				</div>
			{/if}
		</div>
		<!-- {:catch}
     <div>unknown</div> -->
	</div>
</div>
