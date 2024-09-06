<script lang="ts">
	import { liveQuery } from 'dexie';
	import { type NostrEvent } from 'nostr-tools';
	import { getContact } from 'src/stores/contacts';
	import { db, notes } from 'src/stores/db';
	import { isImageUrl } from 'src/lib';
	import * as linkify from 'linkifyjs';

	import { getLinkPreview } from 'link-preview-js';
	import linkifyHtml from 'linkify-html';
	import Icon from '@iconify/svelte';

	let page = 30;

	$: root = liveQuery<NostrEvent[]>(() =>
		$db.notes
			.filter(
				(note) => !note.tags || !note.tags.some((tag) => Array.isArray(tag) && tag[0] === 'e')
			)
			.toArray()
	);
	$: console.log($notes, $root);

	let feed: [
		NostrEvent,
		{
			type: string;
			value: string;
			isLink: boolean;
			href: string;
			start: number;
			end: number;
		}[],
		string
	][];

	$: feed = ($root || []).slice(0, page).map((note) => {
		const links = linkify.find(note.content);

		let content = note.content;
		links.map((link) => {
			console.log(link.type);
			if (isImageUrl(link.value)) {
				link.type = 'image';
			}
			content = content.slice(0, link.start) + content.slice(link.end);
		});
		return [note, links, content];
	});
</script>

<div class="px-2 -mt-8">
	{#each feed as f}
		{#await getContact(f[0].pubkey) then author}
			<div class="flex gap-2 mt-2">
				<div class="w-8 min-w-8">
					<img
						src={author?.picture || '/ns-naked.svg'}
						alt={author?.name}
						class="border w-8 h-8 rounded-full space-x-4 mx-auto"
					/>
				</div>
				<!-- <div>unknown</div> -->
				<div class="flex-grow">
					<div class="flex items-center">
						{author.name}
						{#if author.nip05}
							<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
							<p class="text-xs opacity-50">{author.nip05}</p>
						{/if}
						<p class="text-xs opacity-50 ml-2">
							{#if Date.now() / 1000 - f[0].created_at < 60}
								{Math.floor(Date.now() / 1000 - f[0].created_at)}s
							{:else if Date.now() / 1000 - f[0].created_at < 3600}
								{Math.floor((Date.now() / 1000 - f[0].created_at) / 60)}m
							{:else if Date.now() / 1000 - f[0].created_at < 86400}
								{Math.floor((Date.now() / 1000 - f[0].created_at) / 3600)}h
							{:else}
								{Math.floor((Date.now() / 1000 - f[0].created_at) / 86400)}d
							{/if}
						</p>
					</div>
					<!-- {:catch}
        <div>unknown</div> -->
					<div class="">
						{f[2].slice(0, 500)}{f[2].length > 500 ? '...' : ''}
					</div>
				</div>
			</div>
		{/await}
		<div class="flex gap-2">
			<div class="min-w-8" />
			<div class="flex-grow">
				{#each f[1] as link}
					{#if link.type === 'image'}
						<img src={link.value} alt="image" class="w-full rounded-xl mt-2" />
					{:else}
						{#await getLinkPreview(link.value)}
							<a href={link.href} target="_blank">{link.value}</a>
						{:then preview}
							<a
								href={link.href}
								target="_blank"
								class="w-full rounded-xl border mt-1 block cursor-pointer"
							>
								{#if preview?.images[0]}
									<img src={preview?.images[0]} alt={preview.title} />
								{/if}
								<div class="p-2">
									{#if preview?.title}
										<h2 class="text-sm font-semibold">{preview?.title || link.value}</h2>
									{/if}
									{#if preview?.description}
										<p class="text-xs">{preview?.description}</p>
									{/if}
									{#if preview?.url}
										<span class="text-xs">{preview?.url}</span>
									{/if}
								</div>
							</a>
						{:catch}
							<a href={link.href} target="_blank">{link.value}</a>
						{/await}
					{/if}
				{/each}
			</div>
		</div>
		<div class="flex items-center w-full mt-1 border-b pb-1">
			<div class="min-w-8" />
			<div class="flex-grow flex justify-between px-4 opacity-60">
				<div class="flex items-center gap-1">
					<Icon icon="iconamoon:comment-light" class="" />
				</div>
				<div class="flex items-center">
					<Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" />
					{#await $db.zaps.where('ref').equals(f[0].id).toArray() then zaps}
						{zaps.reduce((acc, cur) => (acc += cur.amount), 0) / 1000 || ''}
					{/await}
				</div>
				<div class="flex items-center gap-1">
					<Icon icon="icon-park-outline:like" class="" />
					{#await $db.reactions.where('ref').equals(f[0].id).count() then count}
						{count || ''}
					{/await}
				</div>
				<div class="flex items-center gap-1">
					<Icon icon="grommet-icons:sync" class="" />
					{0}
				</div>
			</div>
		</div>
	{/each}
</div>
