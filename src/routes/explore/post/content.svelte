<script lang="ts">
	import { bech32 } from 'bech32';
	import * as linkify from 'linkifyjs';
	import Note from '../note.svelte';
	import User from '../user.svelte';
	import Photo from '../photo.svelte';
	import { categorizeURL, decodeNostrReference, isImageUrl } from 'src/lib';
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

	$: links = parts
		.filter((p) => p.type === 'url')
		.map((p) => ({ type: categorizeURL(p.content), value: p.content }));

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

	$: videoLinks = links.filter((link) => link.type === 'video');

	$: otherLinks = links.filter((link) => link.type === 'html');

	$: previews = otherLinks.map((link) =>
		$previewCache.get(
			'https://proxy.nuts.cash/?url=' +
				(link.value.startsWith('http') ? link.value : 'https://' + link.value)
		)
	);

	$: {
		otherLinks.map(
			(l) =>
				l &&
				getLinkPreview(
					'https://proxy.nuts.cash/?url=' +
						(l.value.startsWith('http') ? l.value : 'https://' + l.value)
				).then((p) => {
					previewCache.add(p as Preview);
				})
		);
	}

	onMount(() => {
		// parse the content until it is parsed completely
		const allMatches = patterns.map((p) => {
			const results = content.matchAll(p.regex);
			return [...results].map((r) => ({ match: r[0], index: r.index, type: p.type }));
		});

		const matches = _.flatten(allMatches).sort((a, b) => a.index - b.index);
		let lastIndex = 0;
		parts = [];
		// for each matches, split the content into parts
		matches.forEach((m) => {
			if (m.index > lastIndex) {
				parts = parts.concat({ type: 'text', content: content.slice(lastIndex, m.index) });
			}
			parts = parts.concat({ type: m.type, content: m.match });
			lastIndex = m.index + m.match.length;
		});

		if (lastIndex < content.length) {
			parts = parts.concat({ type: 'text', content: content.slice(lastIndex) });
		}

		// if (!parts.length) {
		// 	parts = [{ type: 'text', content }];
		// }
		// console.log(parts, content, lastIndex, content.length);
	});
	// $: console.log(parts);
	// return parts;
</script>

<div class="text-sm text-wrap whitespace-normal break-words max-w-full">
	{#each parts as part, index}
		{#if part.type == 'text'}
			<!-- {#if !isImageUrl(part.content)} -->
			<span class="break-words">{part.content.slice(0, 500)}</span>
			<!-- {/if} -->
		{:else if part.type == 'url'}
			{#if categorizeURL(part.content) == 'html'}
				<a
					href={part.content}
					class=" text-primary text-semibold break-all overflow-hidden text-ellipsis whitespace-normal text-wrap max-w-full"
					target="_blank">{part.content}</a
				>
			{/if}
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
	<div class="flex-grow" on:click={(e) => e.stopPropagation()}>
		{#if imageLinks.length > 0}
			<div class="gallery-container w-full">
				<div class="pswp-gallery pswp-gallery--single-column relative" id="my-gallery">
					{#each imageLinks as link}
						<Photo {link} />
					{/each}
				</div>
			</div>
		{/if}
		{#if videoLinks.length > 0}
			<video class="rounded-md" src={videoLinks[0].value} controls muted playsinline></video>
		{/if}
		{#each previews.filter((p) => p?.images?.length) as preview}
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
						<p class="text-xs">{preview?.description.slice(0, 150)}...</p>
					{/if}
				</div>
			</a>
		{/each}
	</div>
</div>

<style>
	.gallery-container {
		width: 100%;
		overflow: hidden;
		position: relative;
	}

	.pswp-gallery {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* Internet Explorer 10+ */
	}

	.pswp-gallery::-webkit-scrollbar {
		display: none; /* WebKit */
	}

	.pswp-gallery a {
		flex: 0 0 100%;
		width: 100%;
		scroll-snap-align: center;
		scroll-snap-stop: always;
	}

	.pswp-gallery img {
		width: 100%;
		height: auto;
		object-fit: cover;
	}
</style>
