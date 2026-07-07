<script lang="ts">
	import {
		Kind30023Parsed,
		MessageType,
		type ConnectionStatus,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asParsedEvent,
		fbArray,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { nip19 } from 'nostr-tools';
	import type { AddressPointer } from 'nostr-tools/nip19';
	import { getContext, onDestroy } from 'svelte';

	import RelaysList from 'src/components/RelaysList.svelte';
	import { limit } from 'src/controller/pagination';
	import { proxyPreviewUrl } from 'src/lib/proxy';
	import { parseContent, renderMarkdown, type ContentBlock } from 'src/lib/parseContent';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import Footer from 'src/routes/explore/_post/footer.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { go, usePagerNavigation } from '../modals/modal';
	import { getUserRelays } from '../queries/user';
	import { normalizeURL } from 'nostr-tools/utils';
	import { isMobile } from 'src/controller';

	export let naddr: string;
	export let visible: boolean;
	export let goBack: () => void;
	const nav = usePagerNavigation();

	function openPath(eventPath: string) {
		nav ? nav.push(eventPath) : go(eventPath);
	}

	// Decode naddr (supports both bech32 and custom kind:pubkey:identifier format)
	$: decoded = (() => {
		try {
			// Try bech32 first
			const result = nip19.decode(naddr);
			if (result.type === 'naddr') {
				return result.data as AddressPointer;
			}
		} catch (e) {
			// Fallback to custom format: kind:pubkey:identifier
			const parts = naddr.split(':');
			if (parts.length === 3) {
				const [kind, pubkey, identifier] = parts;
				if (kind && pubkey && identifier) {
					return {
						kind: Number(kind),
						pubkey,
						identifier
					} as AddressPointer;
				}
			}
		}
		return null;
	})();

	let article: ParsedEvent | undefined;
	let loading = true;
	let parsedContent: ContentBlock[] = [];
	let sub: (() => void) | undefined;
	let relaysSub: (() => void) | undefined;
	let relays: string[] = [];

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

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

	// Get parsed article data
	$: parsed = article ? getKind30023(article) : null;

	// Extract metadata
	$: title = parsed?.title() || '';
	$: summary = parsed?.summary() || '';
	$: image = parsed?.image() || '';
	$: content = parsed?.content() || '';
	$: publishedAt = parsed?.publishedAt()
		? new Date(Number(parsed.publishedAt()) * 1000).toLocaleDateString()
		: '';
	$: authorPubkey = article?.pubkey() || decoded?.pubkey || '';

	// Get topics array
	$: topics = (() => {
		if (!parsed) return [];
		const t: string[] = [];
		for (let i = 0; i < parsed.topicsLength(); i++) {
			const topic = parsed.topics(i);
			if (topic) t.push(topic);
		}
		return t;
	})();

	// Parse article content when available
	$: if (content) {
		parseContent(content).then((result) => {
			parsedContent = result;
		});
	}

	function handleEvents(message: WorkerMessage) {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				const normalizedUrl = normalizeURL(relayUrl);
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
			}
			return;
		}

		switch (message.type()) {
			case MessageType.Eoce:
				loading = false;
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (!parsedEvent) return;

				// Check if this is the article we're looking for
				if (decoded && parsedEvent.kind() === 30023) {
					// For parameterized replaceable events, we need to check the 'd' tag
					const tags = fbArray(parsedEvent, 'tags');
					const dTag = tags.find((tag) => {
						const items = fbArray(tag, 'items');
						return items[0] === 'd';
					});
					const identifier = dTag ? fbArray(dTag, 'items')[1] : '';

					if (identifier === decoded.identifier) {
						article = parsedEvent;
						loading = false;
					}
				}
				break;
		}
	}

	function subscribe() {
		if (!visible || !decoded) return;

		// Use provided relays or fetch from author's relays
		const initialRelays = decoded.relays?.length ? decoded.relays : [];

		if (initialRelays.length > 0) {
			subscribeWithRelays(initialRelays);
		} else {
			// Fetch author's relays
			relaysSub = getUserRelays(
				decoded.pubkey,
				(userRelays) => {
					if (userRelays.length > 0) {
						subscribeWithRelays(userRelays);
					} else {
						// Fallback to default relays
						subscribeWithRelays(['wss://relay.damus.io', 'wss://relay.snort.social']);
					}
				},
				'read'
			);
		}
	}

	function subscribeWithRelays(relayList: string[]) {
		if (!decoded || sub) return;

		relays = relayList.slice(0, 5);
		const subId = `article_${decoded.pubkey}_${decoded.identifier}`;

		sub = useSubscription(
			subId,
			[
				{
					kinds: [30023],
					authors: [decoded.pubkey],
					tags: { '#d': [decoded.identifier] },
					limit: 1,
					relays,
					cacheFirst: true
				}
			],
			handleEvents,
			{
				bytesPerEvent: 64 * 1024
			}
		);
	}

	function unsubscribe() {
		sub?.();
		sub = undefined;
		relaysSub?.();
		relaysSub = undefined;
	}

	onDestroy(unsubscribe);

	$: visible ? subscribe() : unsubscribe();

	let imageContext = getContext('imageContext');
</script>

<Feed items={[]} {visible} {loading} class={imageContext ? 'w-full' : 'w-feed'}>
	<svelte:fragment slot="sticky-header">
		<div class="px-4 py-3 flex items-center justify-between bg-base-100 bg-opacity-90">
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold truncate">{title || 'Article'}</h1>
			<span />
		</div>
	</svelte:fragment>

	<svelte:fragment slot="header">
		{#if !imageContext}
			<div
				class="w-feed pt-safe border-primary-content h-20 flex items-center justify-between bg-base-300 bg-opacity-90 rounded-lg px-4"
			>
				<button on:click={goBack} class="p-1 rounded-full bg-base-200 bg-opacity-85 mr-4">
					<Icon icon="mdi:arrow-left" class="text-xl" />
				</button>
				<RelaysList {relays} {connectionStatus} mini />
			</div>
		{/if}

		{#if article}
			{@const parsedData = getKind30023(article)}
			<div class="w-feed mx-auto">
				<!-- Article Header -->
				<div class="bg-base-300 bg-opacity-85 rounded-lg p-6 mb-4">
					<!-- Author info -->
					<div class="flex items-center gap-3 mb-4">
						<Avatar pubkey={authorPubkey} context={[]} size="md" />
						<div class="flex flex-col">
							<User pubkey={authorPubkey} context={[]} link={true} />
							{#if publishedAt}
								<span class="text-xs opacity-60">{publishedAt}</span>
							{/if}
						</div>
					</div>

					<!-- Title -->
					{#if title}
						<h1 class="text-2xl md:text-3xl font-bold mb-4 leading-tight">{title}</h1>
					{/if}

					<!-- Summary -->
					{#if summary}
						<p class="text-lg opacity-80 mb-4 leading-relaxed">{summary}</p>
					{/if}

					<!-- Topics -->
					{#if topics.length > 0}
						<div class="flex flex-wrap gap-2">
							{#each topics as topic}
								<button
									class="text-sm bg-base-200 hover:bg-base-100 px-3 py-1 rounded-full transition-colors"
									on:click={() => openPath(`tags:${encodeURIComponent(topic)}`)}
								>
									#{topic}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Featured Image -->
				{#if image}
					<div class="rounded-lg overflow-hidden mb-4">
						<img src={proxyPreviewUrl(image)} alt={title} class="w-full max-h-96 object-cover" />
					</div>
				{/if}

				<div class="mb-4 bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg px-4 py-3">
					<Footer bind:connectionStatus note={article} {visible} main />
				</div>

				<!-- Article Content -->
				<div class="bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg p-6">
					<div class="prose prose-invert max-w-none">
						{#if parsedContent.length > 0}
							{#each parsedContent as block}
								{#if block.type === 'text'}
									<!-- Render markdown text -->
									<div class="markdown-text">
										{@html renderMarkdown(block.text)}
									</div>
								{:else if block.type === 'image'}
									<img
										src={proxyPreviewUrl(block.data?.src)}
										alt="Article image"
										class="w-full rounded-lg my-4"
									/>
								{:else if block.type === 'video'}
									<video src={block.data?.src} controls class="w-full rounded-lg my-4" />
								{:else if block.type === 'mediaGrid'}
									<div class="grid grid-cols-2 gap-2 my-4">
										{#each block.data?.items || [] as item}
											{#if item.type === 'image'}
												<img
													src={proxyPreviewUrl(item.src)}
													alt=""
													class="w-full rounded-lg object-cover aspect-video"
												/>
											{:else}
												<video
													src={item.src}
													controls
													class="w-full rounded-lg object-cover aspect-video"
												/>
											{/if}
										{/each}
									</div>
								{:else if block.type === 'link'}
									<p class="mb-4">
										<a
											href={block.data?.href}
											target="_blank"
											rel="noopener noreferrer"
											class="text-accent hover:underline break-words"
										>
											{block.text}
										</a>
									</p>
								{:else if block.type === 'hashtag'}
									<button
										class="text-primary font-semibold hover:underline"
										on:click={() => openPath(`tags:${encodeURIComponent(block.data?.tag || '')}`)}
									>
										{block.text}
									</button>
								{:else if block.type === 'code'}
									<pre class="bg-base-200 p-4 rounded-lg overflow-x-auto my-4"><code
											>{block.data?.code}</code
										></pre>
								{:else if block.type === 'npub' || block.type === 'nprofile'}
									<User pubkey={block.data?.decoded?.pubkey} context={[]} link={true} />
								{:else if block.type === 'note' || block.type === 'nevent'}
									{@const entity = block.data?.bech32}
									{#if entity}
										<a
											href={`/note/${entity}`}
											class="text-accent hover:underline break-words"
											on:click|preventDefault={() => openPath(`note:${entity}`)}
										>
											{block.text}
										</a>
									{/if}
								{:else if block.type === 'naddr'}
									{@const entity = block.data?.bech32}
									{#if entity}
										<a
											href={`/article/${entity}`}
											class="text-accent hover:underline break-words"
											on:click|preventDefault={() => openPath(`naddr:${entity}`)}
										>
											{block.text}
										</a>
									{/if}
								{:else if block.type === 'cashu'}
									<div class="my-4 p-3 bg-info-content/30 rounded-lg">
										<code class="text-sm break-all">{block.text}</code>
									</div>
								{:else}
									<span>{block.text}</span>
								{/if}
							{/each}
						{:else}
							<div class="whitespace-pre-wrap leading-relaxed">
								{@html renderMarkdown(content)}
							</div>
						{/if}
					</div>
				</div>

				<div class="mt-3 flex justify-end text-sm opacity-60 px-2">
					{#if decoded?.identifier}
						<button
							class="hover:text-primary transition-colors"
							on:click={() => {
								navigator.clipboard.writeText(`naddr:${naddr}`);
							}}
							title="Copy naddr"
						>
							<Icon icon="mdi:content-copy" />
						</button>
					{/if}
				</div>
			</div>
		{:else if loading}
			<div class="w-feed mx-auto p-6 space-y-4">
				<!-- Loading skeleton -->
				<div class="flex items-center gap-3">
					<div class="w-12 h-12 shimmer rounded-full"></div>
					<div class="space-y-2">
						<div class="h-4 shimmer rounded w-32"></div>
						<div class="h-3 shimmer rounded w-20"></div>
					</div>
				</div>
				<div class="h-8 shimmer rounded w-3/4"></div>
				<div class="h-4 shimmer rounded w-full"></div>
				<div class="h-4 shimmer rounded w-5/6"></div>
				<div class="h-4 shimmer rounded w-4/6"></div>
				<div class="h-64 shimmer rounded w-full"></div>
				<div class="space-y-2">
					<div class="h-4 shimmer rounded w-full"></div>
					<div class="h-4 shimmer rounded w-full"></div>
					<div class="h-4 shimmer rounded w-3/4"></div>
				</div>
			</div>
		{:else}
			<!-- Article not found -->
			<div class="w-feed mx-auto p-6 text-center">
				<Icon icon="mdi:file-document-remove-outline" class="text-6xl opacity-40 mx-auto mb-4" />
				<h2 class="text-xl font-semibold mb-2">Article not found</h2>
				<p class="opacity-60 mb-4">The article you're looking for couldn't be loaded.</p>
				<button on:click={goBack} class="btn btn-primary">
					<Icon icon="mdi:arrow-left" />
					Go Back
				</button>
			</div>
		{/if}
	</svelte:fragment>
</Feed>

<style>
	.shimmer {
		background: linear-gradient(
			90deg,
			var(--fallback-bc, oklch(var(--bc) / 0.1)) 25%,
			var(--fallback-bc, oklch(var(--bc) / 0.2)) 50%,
			var(--fallback-bc, oklch(var(--bc) / 0.1)) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	:global(.prose) {
		color: inherit;
	}

	:global(.prose p) {
		margin-bottom: 1rem;
		line-height: 1.75;
	}

	:global(.prose img) {
		border-radius: 0.5rem;
		margin: 1.5rem 0;
	}

	:global(.prose a) {
		color: var(--fallback-a, oklch(var(--a)));
		text-decoration: none;
	}

	:global(.prose a:hover) {
		text-decoration: underline;
	}

	:global(.prose pre) {
		background: var(--fallback-b2, oklch(var(--b2)));
		padding: 1rem;
		border-radius: 0.5rem;
		overflow-x: auto;
	}

	:global(.prose code) {
		font-family: monospace;
		font-size: 0.875em;
	}
</style>
