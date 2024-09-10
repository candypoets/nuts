<script lang="ts">
	import { bech32 } from 'bech32';
	import * as linkify from 'linkifyjs';
	import Note from '../note.svelte';
	import User from '../user.svelte';
	import Photo from '../photo.svelte';
	import { decodeNostrReference, isImageUrl } from 'src/lib';
	import PhotoSwipeLightbox from 'photoswipe/lightbox';
	import { previewCache, type Preview } from 'src/stores/db';
	import { onMount } from 'svelte';
	import { getLinkPreview } from 'link-preview-js';
	import _ from 'lodash';

	export let content: string = '';

	const patterns = [
		{ regex: /nostr:(note1|nevent1)([a-zA-Z0-9]+)/g, type: 'nostr-note' },
		{ regex: /nostr:(npub1|nprofile1)([a-zA-Z0-9]+)/g, type: 'nostr-pub' },
		{ regex: /(https?:\/\/[^\s]+)/g, type: 'url' },
		{ regex: /#(\w+)/g, type: 'hashtag' },
		{ regex: /\n/g, type: 'line-break' }
		// Add more patterns as needed
	];

	let parts: { type: string; content: string }[] = [];

	$: links = linkify.find(content);

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
		// content = content.slice(0, link.start) + content.slice(link.end);
	});

	$: imageLinks = links.filter((link) => link.type === 'image');

	$: otherLinks = links.filter((link) => link.type !== 'image');

	$: previews = otherLinks.map((link) =>
		$previewCache.get(
			'https://proxy.nuts.cash/?url=' +
				(link.value.startsWith('http') ? link.value : 'https://' + link.value)
		)
	);
	let lastIndex = 0;
	onMount(() => {
		patterns.forEach(({ regex, type }) => {
			let match;
			while ((match = regex.exec(content)) !== null) {
				if (match.index > lastIndex) {
					parts = [...parts, { type: 'text', content: content.slice(lastIndex, match.index) }];
					// parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
				}
				parts = [...parts, { type, content: match[0] }];
				lastIndex = regex.lastIndex;
			}
		});

		if (lastIndex < content.length) {
			parts = [...parts, { type: 'text', content: content.slice(lastIndex) }];
			// parts.push({ type: 'text', content: content.slice(lastIndex) });
		}

		// parts = _.uniqBy(parts, content);

		otherLinks.map((l) =>
			getLinkPreview(
				'https://proxy.nuts.cash/?url=' +
					(l.value.startsWith('http') ? l.value : 'https://' + l.value)
			).then((p) => {
				previewCache.add(p as Preview);
			})
		);
	});
	// $: console.log(parts);
	// return parts;
</script>

{#each parts as part, index}
	{#if part.type == 'text'}
		{#if !isImageUrl(part.content)}
			{part.content.slice(0, 500)}
		{/if}
	{:else if part.type == 'url'}
		<a href={part.content} target="_blank">{part.content}</a>
	{:else if part.type == 'hashtag'}
		<a class="font-semibold text-primary" href={'/search/' + part.content.slice(1)}
			>{part.content}</a
		>
	{:else if part.type == 'line-break'}
		<br />
	{:else if part.type == 'nostr-note'}
		{#if decodeNostrReference(part.content)?.id}
			<Note noteId={decodeNostrReference(part.content)?.id} />
		{/if}
	{:else if part.type == 'nostr-pub'}
		{#if decodeNostrReference(part.content)?.id}
			<User npub={decodeNostrReference(part.content)?.id} />
		{/if}
		<!-- {:else}
		{part.content} -->
	{/if}
{/each}
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
			</div>
		</a>
	{/each}
</div>
