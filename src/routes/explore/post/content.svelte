<script lang="ts">
	import Note from '../note.svelte';
	import User from '../user.svelte';
	import Cashu from './cashu.svelte';
	import _ from 'lodash';
	import type { ContentBlock } from 'src/workers/utils';
	import ImageGrid from 'src/comp/ImageGrid.svelte';

	export let parsedContent: ContentBlock[] = [];
</script>

<div class="text-sm text-wrap whitespace-normal break-words max-w-full relative">
	{#each parsedContent as parsed, index}
		{#if parsed.type == 'text'}
			<!-- {#if !isImageUrl(part.content)} -->
			<span class="break-words">{@html parsed.text.trim().replace(/\n/g, '<br>')}</span>
			<!-- {/if} -->
		{:else if parsed.type == 'link'}
			{#if parsed.data?.preview && parsed.data?.preview?.images?.[0]}
				<a
					href={parsed.data?.href}
					target="_blank"
					class="w-full rounded-xl border mt-1 block cursor-pointer"
				>
					{#if parsed.data?.preview?.images[0]}
						<img src={parsed.data?.preview?.images[0]} alt={parsed.data?.preview?.title} />
					{/if}
					<div class="p-2">
						{#if parsed.data?.preview?.title}
							<h2 class="text-sm break-all font-semibold">{parsed.data?.preview?.title}</h2>
						{/if}
						{#if parsed.data?.preview?.description}
							<p class="text-xs break-all">{parsed.data?.preview?.description.slice(0, 150)}...</p>
						{/if}
					</div>
				</a>
			{:else}
				<a class="text-purple-600" href={parsed.data?.href || ''}>
					{parsed.text}
				</a>
			{/if}
		{:else if parsed.type == 'hashtag'}
			<a class="font-semibold text-primary" href={'/search/' + parsed.data?.tag}>{parsed.text}</a>
		{:else if parsed.type == 'npub' || parsed.type == 'nprofile'}
			<Note noteId={parsed.data?.decoded?.id} />
		{:else if parsed.type == 'note' || parsed.type == 'nevent'}
			<User npub={parsed.data?.decoded?.id} />
		{:else if parsed.type == 'cashu'}
			<Cashu cashu={parsed.text} />
		{:else if parsed.type == 'image'}
			<img class="w-full rounded-md" src={parsed.text} alt={parsed.text} />
		{:else if parsed.type == 'video'}
			<video class="w-full rounded-md" src={parsed.text} autoplay muted></video>
		{:else if parsed.type == 'mediaGrid'}
			<ImageGrid links={parsed.data?.items || []} />
		{/if}
	{/each}
	<!-- <div class="w-full" on:click={(e) => e.stopPropagation()}>
		{#each previews.filter((p) => p?.images?.length) as preview}

		{/each}
	</div> -->
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
