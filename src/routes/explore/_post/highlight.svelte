<script lang="ts">
	import type { NostrEvent as RawNostrEvent } from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';

	import {
		highlightSourceFromTags,
		highlightTagValue,
		readFlatBufferTags
	} from 'src/lib/highlights';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';

	export let event: RawNostrEvent;

	const nav = usePagerNavigation();

	// Tags are the only derived data needed by this card and are shared by all
	// metadata lookups. The excerpt itself stays a direct FlatBuffer read below.
	$: tags = readFlatBufferTags(event);
	$: source = highlightSourceFromTags(tags);
	$: surroundingContext = highlightTagValue(tags, 'context');
	$: comment = highlightTagValue(tags, 'comment');
	function openSource() {
		if (!source || source.type === 'url') return;
		if (source.path) {
			nav ? nav.push(source.path) : go(source.path);
		}
	}
</script>

<div class="pt-3" aria-label="Nostr highlight">
	<div class="relative rounded-lg bg-base-200/70 px-3 py-3 pr-9">
		<Icon
			icon="mdi:format-quote-close"
			class="absolute right-3 top-3 h-5 w-5 text-accent"
			aria-hidden="true"
		/>
		{#if event.content()}
			<blockquote
				class="whitespace-pre-wrap break-words text-[1.02rem] leading-7 text-base-content"
			>
				{event.content()}
			</blockquote>
		{:else}
			<p class="text-sm italic text-base-content/55">A highlight from non-text media.</p>
		{/if}
	</div>

	{#if surroundingContext}
		<p class="mt-2 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-base-content/55">
			{surroundingContext}
		</p>
	{/if}

	{#if comment}
		<p class="mt-3 whitespace-pre-wrap break-words text-sm text-base-content/75">{comment}</p>
	{/if}

	{#if source?.type === 'url'}
		<div class="mt-3 flex justify-end border-t border-primary-content/10 pt-2">
			<a
				href={source.url}
				target="_blank"
				rel="noopener noreferrer"
				class="flex min-w-0 items-center gap-1 text-xs font-semibold text-base-content/65 hover:text-accent hover:underline"
				on:click|stopPropagation
			>
				<span class="truncate">{source.label}</span>
				<Icon icon="mdi:open-in-new" class="h-4 w-4 shrink-0" aria-hidden="true" />
			</a>
		</div>
	{:else if source?.path}
		<div class="mt-3 flex justify-end border-t border-primary-content/10 pt-2">
			<button
				type="button"
				class="flex min-w-0 items-center gap-1 text-xs font-semibold text-base-content/65 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
				on:click|stopPropagation={openSource}
			>
				<span class="truncate">{source.label}</span>
				<Icon icon="mdi:arrow-top-right" class="h-4 w-4 shrink-0" aria-hidden="true" />
			</button>
		</div>
	{/if}
</div>
