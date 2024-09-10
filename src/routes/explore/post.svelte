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
	import Content from './post/content.svelte';
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

	onMount(() => {
		otherLinks.map((l) =>
			getLinkPreview(
				'https://proxy.nuts.cash/?url=' +
					(l.value.startsWith('http') ? l.value : 'https://' + l.value)
			).then((p) => {
				previewCache.add(p as Preview);
			})
		);
	});
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
		<div class="text-sm break-words overflow-hidden">
			<!-- {content?.slice(0, 500)}{content?.length > 500 ? '...' : ''} -->
			<Content content={note.content} />
		</div>
	</div>
</div>
