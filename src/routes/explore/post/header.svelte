<script lang="ts">
	import Icon from '@iconify/svelte';
	import { key } from 'src/stores/db';
	import { getContext, onMount } from 'svelte';
	import { signAndSend } from 'src/actions/relay';
	import { signer } from 'src/stores/signer';
	import type { NIP10Parsed } from 'src/workers/nip10';
	import { cachedProfile, getProfile, isInitialized, nostrDb } from 'src/db';
	import type { Writable } from 'svelte/store';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import _ from 'lodash';
	import type { Contact, Kind0Parsed } from 'src/parsers';

	export let note: ParsedEvent<NIP10Parsed>;

	export let oneline: boolean = true;

	let author: Kind0Parsed | undefined;

	$: profile = getContext<Writable<Kind0Parsed>>('profile');
	$: followList = getContext<Writable<Contact[]>>('followList');

	$: {
		if (!author?.name && $isInitialized) {
			author = JSON.parse(cachedProfile(note.pubkey)?.content || '{}');
		}
	}

	onMount(() => {
		//if there is no author after 500 ms, try to fetch from indexedb
		const timeout = setTimeout(async () => {
			const db = await nostrDb;
			if (!author?.name && db) {
				getProfile(db, note.pubkey).then((res) => (author = JSON.parse(res?.content || '{}')));
			}
		}, 500);
		return () => clearTimeout(timeout);
	});
</script>

<div class="flex gap-2 relative">
	<div class="w-8 min-w-8">
		<img
			src={author?.picture || '/ns-naked.svg'}
			alt={author?.name}
			class="border w-8 h-8 rounded-full space-x-4 mx-auto z-10"
		/>
	</div>
	<div class="w-full">
		<div class="flex items-start" class:items-center={oneline}>
			{#if oneline}
				<div class="whitespace-nowrap overflow-hidden text-ellipsis font-semibold">
					{author?.name}
				</div>
				{#if author?.nip05}
					<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
					<p class="text-xs opacity-50">{author?.nip05}</p>
				{/if}
			{:else}
				<div class="flex-grow">
					<div class="flex items-center">
						<div class="whitespace-nowrap overflow-hidden text-ellipsis">{author?.name}</div>
						<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
						<p class="text-xs opacity-50 ml-2">
							{#if Date.now() / 1000 - note?.created_at < 60}
								{Math.floor(Date.now() / 1000 - note?.created_at)}s
							{:else if Date.now() / 1000 - note?.created_at < 3600}
								{Math.floor((Date.now() / 1000 - note?.created_at) / 60)}m
							{:else if Date.now() / 1000 - note?.created_at < 86400}
								{Math.floor((Date.now() / 1000 - note?.created_at) / 3600)}h
							{:else}
								{Math.floor((Date.now() / 1000 - note?.created_at) / 86400)}d
							{/if}
						</p>
					</div>
					{#if author?.nip05}
						<p class="text-xs opacity-50">{author?.nip05}</p>
					{/if}
				</div>
			{/if}
			{#if oneline}
				<p class="text-xs opacity-50 ml-2">
					{#if Date.now() / 1000 - note?.created_at < 60}
						{Math.floor(Date.now() / 1000 - note?.created_at)}s
					{:else if Date.now() / 1000 - note?.created_at < 3600}
						{Math.floor((Date.now() / 1000 - note?.created_at) / 60)}m
					{:else if Date.now() / 1000 - note?.created_at < 86400}
						{Math.floor((Date.now() / 1000 - note?.created_at) / 3600)}h
					{:else}
						{Math.floor((Date.now() / 1000 - note?.created_at) / 86400)}d
					{/if}
				</p>
			{/if}
			{#if !oneline}
				<div class="flex-grow text-right w-full pr-4">
					<button
						class="btn btn-primary btn-xs"
						on:click={async () => {
							if (!$profile || !author) return;
							await signAndSend($signer, {
								kind: 3,
								pubkey: $key?.pub,
								created_at: Math.floor(Date.now() / 1000),
								tags: _.uniqBy(
									[
										...$followList.map((c) => [['p', c.pubkey, c.relays?.[0]]]),
										[['p', author.pubkey, author.relays?.[0]]]
									],
									(c) => c[0][1]
								).filter((c) =>
									$followList.some((c) => c.pubkey === author?.pubkey)
										? c[0][1] !== author?.pubkey
										: true
								),
								content: ''
							});
						}}
					>
						{!$followList.some((c) => c.pubkey === note?.pubkey) ? 'Follow' : 'Unfollow'}
					</button>
				</div>
			{/if}
		</div>
		<!-- {:catch}
     <div>unknown</div> -->
	</div>
</div>
