<script lang="ts">
	import { goto } from '$app/navigation';
	import Note from '../note.svelte';
	import User from '../user.svelte';
	import Cashu from './cashu.svelte';

	import {
		ContentBlock,
		ContentData,
		type Kind1Parsed,
		type Kind4Parsed,
		type ParsedEvent
	} from '@candypoets/nipworker';
	import {
		asHashtagData,
		asKind1,
		asKind4,
		asLinkPreview,
		asMediaGroupData,
		asNostrData,
		fbArray
	} from '@candypoets/nipworker/utils';
	import { Relaysets } from 'nostr-tools/kinds';
	import ImageGrid from 'src/components/ImageGrid.svelte';
	import { go } from 'src/routes/modals/modal';
	import { getContext } from 'svelte';

	export let note: ParsedEvent;
	export let context: ParsedEvent[] = [];
	export let content: ContentBlock[] = undefined;
	export let depth = 0;
	export let visible: boolean = false;
	export let showMedia = true;
	export let showQuote = true;
	export let main = false;

	let imageContext = getContext('imageContext');
	let showFullContent = false;

	let kind1 = asKind1(note) as Kind1Parsed;
	let kind4 = asKind4(note) as Kind4Parsed;

	let kind = kind1 || kind4;

	$: hasShortened = !content && fbArray(kind1, 'shortenedContent')?.length > 0;
	$: parsedContent =
		content || (hasShortened && !showFullContent)
			? fbArray(kind1, 'shortenedContent') || []
			: fbArray(kind1 || kind4, 'parsedContent') || [];

	// Helper function to check if current block is the last text block
	function isLastTextBlock(index: number, content: ContentBlock[]) {
		if (content.slice(index + 1).some((b) => b.type() == 'text')) return false;
		return true;
	}
</script>

<div
	class:pr-2={imageContext}
	class:!w-full={main}
	class:text-sm={!!depth}
	class={'w-full text-wrap whitespace-normal break-words relative' + ($$props.class || '')}
>
	{#each parsedContent as parsed, index}
		{#if parsed.type() == 'text'}
			{@const rawText = parsed.text() || ''}
			{@const text = (() => {
				try {
					// Attempt to unescape if the string has escaped sequences
					return JSON.parse('"' + rawText + '"');
				} catch (e) {
					// If unescaping fails (e.g., due to control chars), use the raw text
					// Optionally remove all backslashes here if that's what you want
					return rawText.replace(/\\/g, ''); // Remove all '\' if desired
				}
			})()}

			<!-- {#if !isImageUrl(part.content)} -->
			<span class="break-words text-highlight">
				{@html (index == 0
					? text?.trimStart()
					: index == parsedContent.length - 1
						? text?.trimEnd()
						: text
				).replace(/\r\n|\r|\n/g, '<br>')}
			</span>
			{#if hasShortened && isLastTextBlock(index, parsedContent)}
				<button
					class="text-primary text-sm font-medium ml-1 hover:underline"
					on:click|stopPropagation={() => (showFullContent = !showFullContent)}
				>
					{showFullContent ? 'See less' : 'See more'}
				</button>
			{/if}
			<!-- {/if} -->
		{:else if parsed.dataType() == ContentData.LinkPreviewData}
			{@const preview = asLinkPreview(parsed)}
			{#if preview && preview?.image() && false}
				<a
					href={preview?.url()}
					target="_blank"
					on:click|stopPropagation
					rel="noopener noreferrer"
					class="w-full rounded-xl border mt-1 block cursor-pointer"
				>
					{#if preview?.image()}
						<img src={preview?.image()} alt={preview?.title()} />
					{/if}
					<div class="p-2">
						{#if preview?.title()}
							<h2 class="text-sm break-all font-semibold">{preview?.title()}</h2>
						{/if}
						{#if preview?.description}
							<p class="text-xs break-all">
								{preview?.description()?.slice(0, 150)}...
							</p>
						{/if}
					</div>
				</a>
			{:else}
				<a
					class="text-accent hover:underline break-words break-all max-w-full w-full"
					on:click|stopPropagation
					href={preview?.url() || ''}
					target="_blank"
					rel="noopener noreferrer"
				>
					{parsed.text()}
				</a>
			{/if}
		{:else if parsed.dataType() == ContentData.HashtagData}
			{@const hashtag = asHashtagData(parsed)}
			<a
				on:click|stopPropagation|preventDefault={() =>
					go(`tags:${encodeURIComponent(hashtag?.tag() ?? '')}`)}
				class="font-semibold text-primary"
				>{parsed.text()}
			</a>
		{:else if parsed.dataType() == ContentData.NostrData}
			{@const nostr = asNostrData(parsed)}
			{@const author = nostr?.author()}
			{#if author && nostr
					?.entity()
					?.match(/n(profile|pub)/)}
				<User pubkey={nostr?.author()} {context} />
			{:else if nostr?.id()}
				{#if showQuote}
					{@const entity = nostr?.entity()}
					{@const id = nostr?.id()}
					{@const entityRelays = fbArray(nostr, 'relays')}
					{#if entity?.startsWith('naddr')}
						<!-- Use the naddr bech32 string directly -->
						<Note
							naddr={entity}
							{context}
							{visible}
							depth={depth + 1}
							relays={entityRelays}
							footer={false}
						/>
					{:else}
						<!-- Regular nevent/note -->
						<Note
							noteId={id}
							{context}
							{visible}
							depth={depth + 1}
							relays={entityRelays}
							footer={false}
						/>
					{/if}
				{:else}
					{nostr?.id()}
				{/if}
			{/if}
		{:else if parsed.dataType() == ContentData.CashuData}
			<Cashu cashu={parsed.text()} />
		{:else if parsed.dataType() == ContentData.ImageData && showMedia}
			<ImageGrid {note} links={[{ src: parsed.text() || '', type: 'image' }]} />
			<!-- <img class="lg:min-w-88 rounded-md" src={parsed.text} alt={parsed.text} /> -->
		{:else if parsed.dataType() == ContentData.VideoData && showMedia}
			<ImageGrid {note} links={[{ src: parsed.text() || '', type: 'video' }]} />
			<!-- <video class="w-full rounded-md" src={parsed.text} autoplay muted></video> -->
		{:else if parsed.dataType() == ContentData.MediaGroupData && showMedia}
			{@const mediaGrid = asMediaGroupData(parsed)}
			{#if mediaGrid}
				<ImageGrid
					{note}
					links={fbArray(mediaGrid, 'items').map((md) =>
						md.image
							? { src: md.image()?.url() || '', type: 'image' }
							: { src: md.video()?.url() || '', type: 'image' }
					) || []}
				/>
			{/if}
		{/if}
	{/each}

	<!-- <div class="w-full" on:click={(e) => e.stopPropagation()">
		{#each previews.filter((p) => p?.images?.length) as preview}

		{/each}
	</div> -->
</div>
