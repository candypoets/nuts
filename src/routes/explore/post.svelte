<script lang="ts">
	import type { NPool } from '@nostrify/nostrify';
	import Icon from '@iconify/svelte';
	import { kinds, type Event, type NostrEvent } from 'nostr-tools';
	import { getContact } from 'src/stores/contacts';
	import * as linkify from 'linkifyjs';
	import { isImageUrl } from 'src/lib';
	import { getLinkPreview } from 'link-preview-js';
	import { db, contacts, previewCache, type Preview } from 'src/stores/db';
	import { liveQuery } from 'dexie';
	import PhotoSwipeLightbox from 'photoswipe/lightbox';
	import Contact from './contact.svelte';
	import { onMount } from 'svelte';
	import { pool } from 'src/stores/relays';
	import { fetchReactions, fetchReplies, fetchZaps } from 'src/stores/notes';
	import Photo from './photo.svelte';
	import { selectedPost } from 'src/stores';

	export let note: NostrEvent;

	$: links = linkify.find(note.content);

	let content: string = note.content;

	let lightbox: PhotoSwipeLightbox;

	$: links.map((link) => {
		if (isImageUrl(link.value)) {
			link.type = 'image';
			lightbox = new PhotoSwipeLightbox({
				gallery: '#my-gallery',
				children: 'a',
				pswpModule: () => import('photoswipe')
			});
			lightbox.init();
		}
		content = content.slice(0, link.start) + content.slice(link.end);
	});

	$: imageLinks = links.filter((link) => link.type === 'image');

	$: otherLinks = links.filter((link) => link.type !== 'image');

	$: previews = otherLinks.map((link) =>
		$previewCache.get(
			'https://proxy.nuts.cash/?url=' +
				(link.value.startsWith('http') ? link.value : 'https://' + link.value)
		)
	);

	$: contact = $contacts.find((c) => c.pubkey === note.pubkey);

	$: reactions = liveQuery(() => $db.reactions.where('ref').equals(note.id).count());

	$: zaps = liveQuery(() => $db.zaps.where('ref').equals(note.id).toArray());

	$: replies = liveQuery(() => $db.notes.where('reply_to').equals(note.id).toArray());

	onMount(() => {
		let abortController = new AbortController();

		fetchReactions($pool, note, abortController);
		fetchZaps($pool, note, abortController);
		fetchReplies($pool, note, abortController);

		otherLinks.map((l) =>
			getLinkPreview(
				'https://proxy.nuts.cash/?url=' +
					(l.value.startsWith('http') ? l.value : 'https://' + l.value)
			).then((p) => {
				previewCache.add(p as Preview);
			})
		);

		return () => {
			abortController.abort();
		};
	});

	$: console.log($previewCache);
</script>

<div on:click={() => ($selectedPost = note)}>
	{#if contact?.createdAt}
		<Contact {note} author={contact} />
	{:else}
		{#await getContact(note.pubkey) then author}
			<Contact {note} {author} />
		{/await}
	{/if}
	<div class="flex gap-2">
		<div class="min-w-8" />
		<div class="text-sm">
			{content?.slice(0, 500)}{content?.length > 500 ? '...' : ''}
		</div>
	</div>
</div>
<div class="flex gap-2">
	<div class="min-w-8" />
	<div class="flex-grow">
		{#if imageLinks.length > 0}
			<div class="pswp-gallery pswp-gallery--single-column" id="my-gallery">
				{#each imageLinks as link}
					<Photo {link} />
				{/each}
			</div>
		{/if}
		{#each previews as preview}
			<a
				href={preview?.url.split('https://proxy.nuts.cash/?url=')[1]}
				target="_blank"
				class="w-full rounded-xl border mt-1 block cursor-pointer"
			>
				{#if preview?.images[0]}
					<img src={preview?.images[0]} alt={preview.title} />
				{/if}
				<div class="p-2">
					{#if preview?.title}
						<h2 class="text-sm font-semibold">{preview?.title}</h2>
					{/if}
					{#if preview?.description}
						<p class="text-xs">{preview?.description}</p>
					{/if}
					{#if preview?.url}
						<span class="text-xs">{preview?.url.split('https://proxy.nuts.cash/?url=')[1]}</span>
					{/if}
				</div>
			</a>
		{/each}
	</div>
</div>
<div class="flex items-center w-full mt-1 border-b pb-1">
	<div class="min-w-8" />
	<div class="flex-grow flex justify-between px-4 opacity-60">
		<div class="flex items-center gap-1">
			<Icon icon="iconamoon:comment-light" class="" />
			{$replies?.length || ''}
		</div>
		<div class="flex items-center">
			<Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" />
			{$zaps?.reduce((acc, cur) => (acc += cur.amount), 0) / 1000 || ''}
		</div>
		<div class="flex items-center gap-1">
			<Icon icon="icon-park-outline:like" class="" />
			{$reactions || ''}
		</div>
		<div class="flex items-center gap-1">
			<Icon icon="grommet-icons:sync" class="" />
			{0}
		</div>
	</div>
</div>
