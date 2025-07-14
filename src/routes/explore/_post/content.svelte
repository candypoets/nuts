<script lang="ts">
	import Note from '../note.svelte';
	import User from '../user.svelte';
	import Cashu from './cashu.svelte';
	import _ from 'lodash';

	import ImageGrid from 'src/components/ImageGrid.svelte';
	import type { Kind1Parsed, Kind4Parsed, ParsedEvent } from 'src/types';
	import type { AnyKind } from 'src/types';
	import { getContext } from 'svelte';

	export let note: ParsedEvent<Kind1Parsed | Kind4Parsed>;
	export let context: ParsedEvent<AnyKind>[] = [];
	export let depth = 0;
	export let visible: boolean = false;
	export let showMedia = true;
	export let showQuote = true;

	let imageContext = getContext('imageContext');
	let showFullContent = false;

	$: hasShortened = note?.parsed?.shortenedContent?.length > 0;
	$: parsedContent =
		hasShortened && !showFullContent
			? note?.parsed?.shortenedContent || []
			: note?.parsed?.parsedContent || [];

	// Helper function to check if current block is the last text block
	function isLastTextBlock(index: number, content: any[]) {
		for (let i = index + 1; i < content.length; i++) {
			if (content[i].type === 'text') {
				return false;
			}
		}
		return true;
	}
</script>

<div
	class:max-w-72={imageContext}
	class={(!depth
		? 'w-post'
		: 'w-post-' + depth + ' text-sm text-wrap whitespace-normal break-words relative') +
		($$props.class || '')}
>
	{#each parsedContent as parsed, index}
		{#if parsed.type == 'text'}
			<!-- {#if !isImageUrl(part.content)} -->
			<span class="break-words"
				>{@html (index == 0
					? parsed.text.trimStart()
					: index == parsedContent.length - 1
						? parsed.text.trimEnd()
						: parsed.text
				).replace(/\n/g, '<br>')}</span
			>
			{#if hasShortened && isLastTextBlock(index, parsedContent)}
				<button
					class="text-primary text-sm font-medium ml-1 hover:underline"
					on:click|stopPropagation={() => (showFullContent = !showFullContent)}
				>
					{showFullContent ? 'See less' : 'See more'}
				</button>
			{/if}
			<!-- {/if} -->
		{:else if parsed.type == 'link'}
			{#if parsed.data?.preview && parsed.data?.preview?.images?.[0]}
				<a
					href={parsed.data?.href}
					target="_blank"
					on:click|stopPropagation
					rel="noopener noreferrer"
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
				<a
					class="text-accent"
					on:click|stopPropagation
					href={parsed.data?.href || ''}
					target="_blank"
					rel="noopener noreferrer"
				>
					{parsed.text}
				</a>
			{/if}
		{:else if parsed.type == 'hashtag'}
			<a class="font-semibold text-primary" href={'/search/' + parsed.data?.tag}>{parsed.text}</a>
		{:else if parsed.type == 'npub' || parsed.type == 'nprofile'}
			<User
				pubkey={parsed.data?.decoded?.pubkey ||
					parsed.data?.decoded?.PublicKey ||
					parsed.data?.decoded}
				{context}
			/>
		{:else if parsed.type == 'note' || (parsed.type == 'nevent' && showQuote)}
			<Note
				noteId={parsed.data?.decoded?.id || parsed.data?.decoded}
				{context}
				{visible}
				depth={depth + 1}
				footer={false}
			/>
		{:else if parsed.type == 'cashu'}
			<Cashu cashu={parsed.text} />
		{:else if parsed.type == 'image' && showMedia}
			<ImageGrid {note} links={[{ src: parsed.text, type: 'image' }]} />
			<!-- <img class="lg:min-w-88 rounded-md" src={parsed.text} alt={parsed.text} /> -->
		{:else if parsed.type == 'video' && showMedia}
			<ImageGrid {note} links={[{ src: parsed.text, type: 'video' }]} />
			<!-- <video class="w-full rounded-md" src={parsed.text} autoplay muted></video> -->
		{:else if parsed.type == 'mediaGrid' && showMedia}
			<ImageGrid {note} links={parsed.data?.items || []} />
		{/if}
	{/each}

	<!-- <div class="w-full" on:click={(e) => e.stopPropagation()">
		{#each previews.filter((p) => p?.images?.length) as preview}

		{/each}
	</div> -->
</div>
