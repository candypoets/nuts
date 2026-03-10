<script lang="ts">
	import { Kind30023Parsed, type ParsedEvent } from '@candypoets/nipworker';
	import { proxyPreviewUrl } from 'src/lib/proxy';
	import { go } from 'src/routes/modals/modal';
	import { nip19 } from 'nostr-tools';
	import Icon from '@iconify/svelte';

	export let note: ParsedEvent;

	// Extract Kind30023Parsed from the note
	function getKind30023(note: ParsedEvent): Kind30023Parsed | null {
		if (!note) return null;
		try {
			const parsed = note.parsed(new Kind30023Parsed());
			return parsed as Kind30023Parsed | null;
		} catch {
			return null;
		}
	}

	// Helper to extract tags from note using the FlatBuffers API
	function getTagsFromNote(note: ParsedEvent): string[][] {
		if (!note || typeof note.tagsLength !== 'function') return [];
		const tags: string[][] = [];
		for (let i = 0; i < note.tagsLength(); i++) {
			const tagVec = note.tags(i);
			if (!tagVec || typeof tagVec.itemsLength !== 'function') continue;
			const tag: string[] = [];
			for (let j = 0; j < tagVec.itemsLength(); j++) {
				const item = tagVec.items(j);
				tag.push(item || '');
			}
			tags.push(tag);
		}
		return tags;
	}

	// Helper to get tag value from tags array
	function getTagValue(tags: string[][], name: string): string | undefined {
		const tag = tags.find((t) => t[0] === name);
		return tag?.[1];
	}

	// Helper to get all values for a tag (e.g., 't' for topics)
	function getTagValues(tags: string[][], name: string): string[] {
		return tags
			.filter((t) => t[0] === name)
			.map((t) => t[1])
			.filter(Boolean);
	}

	$: parsed = getKind30023(note);

	// Extract data from parsed object or fallback to raw tags
	$: rawTags = getTagsFromNote(note);

	$: title = parsed?.title() || getTagValue(rawTags, 'title') || '';
	$: summary = parsed?.summary() || getTagValue(rawTags, 'summary') || '';
	$: rawImage = parsed?.image() || getTagValue(rawTags, 'image') || '';
	$: image = rawImage ? proxyPreviewUrl(rawImage) : '';
	$: canonical =
		parsed?.canonical() ||
		getTagValue(rawTags, 'canonical_url') ||
		getTagValue(rawTags, 'url') ||
		'';
	$: slug = parsed?.slug() || getTagValue(rawTags, 'd') || '';
	$: naddr = parsed?.naddr() || '';
	$: publishedAt = parsed?.publishedAt()
		? new Date(Number(parsed.publishedAt()) * 1000).toLocaleDateString()
		: getTagValue(rawTags, 'published_at')
			? new Date(Number(getTagValue(rawTags, 'published_at')) * 1000).toLocaleDateString()
			: '';

	// Get topics array
	$: topics = (() => {
		if (parsed) {
			const t: string[] = [];
			for (let i = 0; i < parsed.topicsLength(); i++) {
				const topic = parsed.topics(i);
				if (topic) t.push(topic);
			}
			return t;
		}
		return getTagValues(rawTags, 't');
	})();

	function openArticle() {
		// Always use bech32-encoded naddr to avoid URL issues with special characters
		// The identifier might contain slashes (e.g., dates like 23/02/2026) which break routing
		if (slug && note?.pubkey) {
			const naddrBech32 = nip19.naddrEncode({
				kind: note.kind(),
				pubkey: note.pubkey()! || '',
				identifier: slug
			});
			go(`naddr:${naddrBech32}`);
		}
	}
</script>

{#if title || summary || image || slug}
	<div
		class="mt-2 rounded-lg overflow-hidden border border-primary-content/20 cursor-pointer hover:opacity-95 transition-opacity relative group min-h-[280px]"
		on:click|stopPropagation={openArticle}
	>
		{#if image}
			<!-- Full background image -->
			<div class="absolute inset-0">
				<img
					src={image}
					alt={title}
					class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
				/>
			</div>

			<!-- Gradient backdrop for text readability -->
			<div class="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black/70"></div>
		{:else}
			<!-- Fallback gradient background when no image -->
			<div class="absolute inset-0 bg-gradient-to-br from-primary/40 to-secondary/40"></div>
		{/if}

		<!-- Content overlaid on top -->
		<div class="relative z-10 p-4 flex flex-col h-full min-h-[280px]">
			<!-- Article badge -->
			<div class="flex items-center gap-1 text-white/70 text-xs mb-3">
				<Icon icon="mdi:file-document-outline" />
				<span>Article</span>
			</div>

			<!-- Title at the top -->
			{#if title}
				<h3 class="font-bold text-xl leading-tight mb-3 text-white line-clamp-3 drop-shadow-lg">
					{title}
				</h3>
			{/if}

			<!-- Summary -->
			{#if summary}
				<p class="text-sm text-white/90 line-clamp-4 mb-4 drop-shadow-md">{summary}</p>
			{/if}

			<!-- Spacer to push footer to bottom -->
			<div class="flex-grow"></div>

			<!-- Footer -->
			<div class="flex items-center justify-between pt-3 border-t border-white/20">
				<div class="flex items-center gap-2 text-xs text-white/70">
					{#if publishedAt}
						<span>{publishedAt}</span>
					{/if}
				</div>
				{#if canonical}
					<a
						href={canonical}
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-white hover:text-white/80 hover:underline flex items-center gap-1"
						on:click|stopPropagation
					>
						<Icon icon="mdi:open-in-new" />
						<span>Read</span>
					</a>
				{/if}
			</div>

			{#if topics.length > 0}
				<div class="flex flex-wrap gap-1 mt-3">
					{#each topics.slice(0, 5) as topic}
						<span class="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">#{topic}</span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="p-3 rounded-lg bg-info-content/30 text-sm flex items-center gap-2 mt-2">
		<Icon icon="mdi:file-document-outline" />
		<span>Article (kind 30023) - parsed data not available</span>
	</div>
{/if}
