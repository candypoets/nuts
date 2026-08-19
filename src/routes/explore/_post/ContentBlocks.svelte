<script lang="ts">
	import Note from '../note.svelte';
	import User from '../user.svelte';
	import Cashu from './cashu.svelte';
	import Highlight from './highlight.svelte';
	import LinkPreviewCard from './LinkPreviewCard.svelte';
	import ReferencedEvent from './ReferencedEvent.svelte';
	import YouTube from './YouTube.svelte';

	import { ContentBlock, ContentData, type ParsedEvent } from '@candypoets/nipworker';
	import {
		asEmojiData,
		asHashtagData,
		asLinkPreview,
		asMediaGroupData,
		asNostrData,
		fbArray
	} from '@candypoets/nipworker/utils';
	import ImageGrid from 'src/components/ImageGrid.svelte';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';
	import { getContext } from 'svelte';

	export let content: ContentBlock[];
	export let shortContent: ContentBlock[] | undefined = undefined;
	export let showFull = false;
	export let note: ParsedEvent | undefined = undefined;
	export let context: ParsedEvent[] = [];
	export let visible: boolean = false;
	export let depth = 0;
	export let showMedia = true;
	export let showMediaUrls = false;
	export let showQuote = true;

	let imageContext = getContext('imageContext');
	const nav = usePagerNavigation();

	function pushPath(eventPath: string) {
		nav ? nav.push(eventPath) : go(eventPath);
	}

	$: displayContent = shortContent?.length && !showFull ? shortContent : content;

	function handleContentClick(event: MouseEvent) {
		if (!shortContent?.length || showFull) return;

		event.stopPropagation();
		showFull = true;
	}

	function showLess(event: MouseEvent) {
		event.stopPropagation();
		showFull = false;
	}

	function showMore(event: MouseEvent) {
		event.stopPropagation();
		showFull = true;
	}

	// Helper function to check if current block is the last text block
	function isLastTextBlock(index: number, blocks: ContentBlock[]) {
		if (blocks.slice(index + 1).some((b) => b.type() == 'text')) return false;
		return true;
	}

	// Check if URL is a YouTube link
	function isYouTubeUrl(url: string | null | undefined): boolean {
		if (!url) return false;
		return url.includes('youtube.com') || url.includes('youtu.be');
	}

	function mediaUrls(parsed: ContentBlock): string[] {
		if (parsed.dataType() == ContentData.MediaGroupData) {
			const mediaGrid = asMediaGroupData(parsed);
			if (!mediaGrid) return [];
			return fbArray(mediaGrid, 'items')
				.map((md) => md.image()?.url() || md.video()?.url() || '')
				.filter((url): url is string => !!url);
		}

		const url = parsed.text();
		return url ? [url] : [];
	}

	function mediaGroupLinks(parsed: ContentBlock) {
		const mediaGrid = asMediaGroupData(parsed);
		if (!mediaGrid) return [];

		return fbArray(mediaGrid, 'items').map((item) => {
			const image = item.image();
			const video = item.video();

			return image
				? { src: image.url() || '', type: 'image' as const, dim: image.dim() || undefined }
				: {
						src: video?.url() || '',
						type: 'video' as const,
						dim: video?.dim() || undefined,
						poster: video?.thumbnail() || undefined
					};
		});
	}

	function nostrRelays(nostr: ReturnType<typeof asNostrData>): string[] {
		return nostr ? (fbArray(nostr, 'relays') as string[]) : [];
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class:pr-2={imageContext}
	class:text-sm={!!depth}
	class={'w-full text-wrap whitespace-normal break-words relative select-text' +
		($$props.class || '')}
	on:click={handleContentClick}
>
	{#each displayContent as parsed, index}
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

			<span class="break-words text-highlight">
				{@html (index == 0
					? text?.trimStart()
					: index == displayContent.length - 1
						? text?.trimEnd()
						: text
				).replace(/\r\n|\r|\n/g, '<br>')}
			</span>
			{#if shortContent?.length && isLastTextBlock(index, displayContent)}
				<button
					class="text-primary text-sm font-medium ml-1 hover:underline"
					on:click={showFull ? showLess : showMore}
				>
					{showFull ? 'See less' : 'See more'}
				</button>
			{/if}
		{:else if parsed.type() === 'emoji'}
			{@const emoji = asEmojiData(parsed)}
			{#if emoji}
				<img
					src={emoji.url() || ''}
					alt={emoji.shortcode() || ''}
					title={emoji.shortcode() || ''}
					class="inline-block h-6 w-6 align-middle mx-0.5"
				/>
			{/if}
		{:else if parsed.dataType() == ContentData.LinkPreviewData}
			{@const preview = asLinkPreview(parsed)}
			{#if preview && isYouTubeUrl(preview?.url())}
				<YouTube url={preview?.url() || ''} />
			{:else if preview?.url() || parsed.text()}
				<LinkPreviewCard url={preview?.url() || parsed.text() || ''} text={parsed.text() || ''} />
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
					pushPath(`tags:${encodeURIComponent(hashtag?.tag() ?? '')}`)}
				class="font-semibold text-primary"
				>{parsed.text()}
			</a>
		{:else if parsed.dataType() == ContentData.NostrData}
			{@const nostr = asNostrData(parsed)}
			{@const author = nostr?.author()}
			{#if author && nostr?.entity()?.match(/n(profile|pub)/)}
				<User pubkey={author} {context} />
			{:else if nostr?.id()}
				{#if showQuote}
					{@const entity = nostr?.entity()}
					{@const id = nostr?.id() || ''}
					{@const entityRelays = nostrRelays(nostr)}
					{#if entity?.startsWith('naddr')}
						<!-- Use the naddr bech32 string directly -->
						<Note
							naddr={entity || ''}
							{context}
							{visible}
							depth={depth + 1}
							relays={entityRelays}
							footer={false}
						/>
					{:else}
						<!-- Event IDs may resolve to parsed notes or raw-only events such as kind 9802. -->
						<ReferencedEvent
							noteId={id}
							{visible}
							relays={entityRelays}
							kind={Number(nostr?.kind()) || undefined}
							let:event
						>
							<Note customEvent={event} {context} {visible} depth={depth + 1} footer={false}>
								<svelte:fragment slot="body">
									<Highlight {event} />
								</svelte:fragment>
							</Note>
							<svelte:fragment slot="fallback">
								<Note
									noteId={id}
									{context}
									{visible}
									depth={depth + 1}
									relays={entityRelays}
									footer={false}
								/>
							</svelte:fragment>
						</ReferencedEvent>
					{/if}
				{:else}
					{nostr?.id()}
				{/if}
			{/if}
		{:else if parsed.dataType() == ContentData.CashuData}
			<Cashu cashu={parsed.text() || ''} />
		{:else if parsed.dataType() == ContentData.ImageData || parsed.dataType() == ContentData.VideoData || parsed.dataType() == ContentData.MediaGroupData}
			{#if showMedia}
				{#if parsed.dataType() == ContentData.ImageData}
					<ImageGrid {note} {visible} links={[{ src: parsed.text() || '', type: 'image' }]} />
				{:else if parsed.dataType() == ContentData.VideoData}
					<ImageGrid {note} {visible} links={[{ src: parsed.text() || '', type: 'video' }]} />
				{:else}
					<ImageGrid {note} {visible} links={mediaGroupLinks(parsed)} />
				{/if}
			{:else if showMediaUrls}
				{#each mediaUrls(parsed) as url (url)}
					<a
						class="text-accent hover:underline break-words break-all max-w-full w-full"
						on:click|stopPropagation
						href={url}
						target="_blank"
						rel="noopener noreferrer"
					>
						{url}
					</a>
				{/each}
			{/if}
		{/if}
	{/each}
</div>
