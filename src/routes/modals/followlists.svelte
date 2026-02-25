<script lang="ts">
	import {
		ParsedData,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asNip51, fbArray, isNip51, isParsedEvent } from '@candypoets/nipworker/utils';

	import Icon from '@iconify/svelte';
	import { followList, followPacks } from 'src/controller/feed';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import MultiSelect from 'src/routes/modals/components/MultiSelect.svelte';
	import { getContext, onDestroy, onMount } from 'svelte';

	let animator: PagerAnimator = getContext('animator');

	let searchQuery = '';
	let subscriptionID = 'followlists';

	let fps = $followPacks;

	// Combine followList with fetched packs, avoiding duplicates
	let otherPacks: ParsedEvent[] = [];
	$: feed = [$followList, ...otherPacks];

	let seenEventIds = new Set<number>();
	let loading = false;

	let unsubscribe: (() => void) | undefined;
	let prevPaginationSubId: string | undefined = undefined;

	// Pagination state
	let until: number | undefined = undefined;
	let hasMore = true;
	let paginationCounter = 0;
	let itemsBeforePagination = 0;
	let paginationTimeout: ReturnType<typeof setTimeout> | undefined;

	function buildRequests(isPagination = false): RequestObject[] {
		const req: RequestObject = {
			kinds: [39089],
			limit: 50,
			noCache: true,
			relays: []
		};
		if (isPagination && until) {
			req.until = until;
		}
		return [req];
	}

	function handleEvents(message: WorkerMessage) {
		const parsedEvent = isParsedEvent(message);
		if (!parsedEvent) {
			console.log('[FollowLists] handleEvents: not a parsed event', message);
			return;
		}

		const kindList = isNip51(message);
		if (!kindList) {
			console.log('[FollowLists] handleEvents: not a nip51', message.type?.());
			return;
		}
		if (!kindList?.title()) {
			console.log('[FollowLists] handleEvents: no title');
			return;
		}

		const eventId = parsedEvent.id()?.fnv1aHash();
		if (!eventId) {
			console.log('[FollowLists] handleEvents: no eventId');
			return;
		}
		if (seenEventIds.has(eventId)) {
			console.log('[FollowLists] handleEvents: duplicate event', eventId);
			return;
		}
		seenEventIds.add(eventId);

		// Don't add followlist (it's handled reactively via $followList)
		if (parsedEvent.id()?.toString() === 'followlist') {
			console.log('[FollowLists] handleEvents: skipping followlist');
			return;
		}

		console.log('[FollowLists] handleEvents: adding event', eventId, 'title:', kindList.title()?.toString());
		otherPacks = [...otherPacks, parsedEvent].sort((a, b) => b.createdAt() - a.createdAt());
		loading = false;
	}

	onMount(() => {
		console.log('hi');
		loading = true;
		const requests = buildRequests();
		unsubscribe = useSubscription(subscriptionID, requests, handleEvents, {
			bytesPerEvent: 10 * 1024
		});
	});

	function toggleFollowPack(pack: ParsedEvent) {
		// Check if the pack is already in the list
		const packIndex = fps.findIndex((p) => p.id()?.fnv1aHash() === pack.id()?.fnv1aHash());

		if (packIndex !== -1) {
			// Pack exists, remove it
			fps = fps.filter((_, i) => i !== packIndex);
		} else {
			// Pack doesn't exist, add it
			fps = [...fps, pack];
		}
	}

	onDestroy(() => {
		$followPacks = fps;
		unsubscribe?.();
		if (paginationTimeout) clearTimeout(paginationTimeout);
		prevPaginationSubId = undefined;
	});

	// Track when pagination completes and check if new items were added
	$: if (!loading && itemsBeforePagination > 0) {
		const itemsAtCheck = itemsBeforePagination;

		// Clear the timeout if it hasn't fired yet
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}

		// Check if we actually got new items
		const newItemsAdded = otherPacks.length - itemsAtCheck;
		console.log('[FollowLists] Pagination complete. New items added:', newItemsAdded);
		if (newItemsAdded === 0) {
			hasMore = false;
			console.log('[FollowLists] No more data available');
		}
		itemsBeforePagination = 0;
	}

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		console.log('[FollowLists] handleNearBottom called', { loading, hasMore, otherPacksLength: otherPacks.length });
		if (loading || !hasMore || otherPacks.length === 0) {
			console.log('[FollowLists] Pagination blocked:', { loading, hasMore, otherPacksLength: otherPacks.length });
			return;
		}

		loading = true;
		itemsBeforePagination = otherPacks.length;
		paginationCounter++;

		// Use the createdAt of an item ~5 positions back as until (with overlap buffer)
		// This prevents gaps if the last few items arrived out of order
		const overlapIndex = Math.max(0, otherPacks.length - 6);
		const cursorItem = otherPacks[overlapIndex];
		if (cursorItem) {
			until = cursorItem.createdAt() - 1;
			console.log('[FollowLists] Pagination cursor at index', overlapIndex, 'of', otherPacks.length, 'timestamp:', until);
		}

		const requests = buildRequests(true);
		const pageSubId = subscriptionID + '_page_' + paginationCounter + '_' + until;
		console.log('[FollowLists] Starting pagination:', { pageSubId, until, requests });
		useSubscription(pageSubId, requests, handleEvents, {
			bytesPerEvent: 10 * 1024,
			pagination: prevPaginationSubId || subscriptionID
		});
		// Track this subId for next pagination
		prevPaginationSubId = pageSubId;

		// Fallback: clear loading after timeout if EOSE isn't received
		paginationTimeout = setTimeout(() => {
			console.log('[FollowLists] Pagination timeout, clearing loading state');
			loading = false;
		}, 10000);
	}

	// Process feed: filter by search, require images, and minimum members
	// Always include the user's followlist (id = "followlist")
	$: processedFeed = feed.filter((item) => {
		const kind39089 = asNip51(item);
		const itemId = item?.id?.()?.toString();

		// Always include the user's followlist regardless of filters
		if (itemId === 'followlist') return true;

		// Filter out packs without images
		if (!kind39089?.image()) return false;
		// Filter out packs with less than 10 members
		if (kind39089.peopleLength() < 10) return false;
		// Filter by search query
		if (!searchQuery) return true;
		const searchTerm = searchQuery.toLowerCase();
		const title = kind39089?.title?.()?.toString()?.toLowerCase() ?? '';
		const description = kind39089?.description?.()?.toString()?.toLowerCase() ?? '';
		return title.includes(searchTerm) || description.includes(searchTerm);
	});
</script>

<div class="h-full bg-base-300 bg-opacity-85 lg:pt-4">
	<Feed
		items={processedFeed}
		getItemId={(item) => item?.id?.()?.fnv1aHash?.() ?? Math.random()}
		onNearBottom={handleNearBottom}
		visible
	>
		<svelte:fragment slot="sticky-header">
			<div class="pt-safe w-feed h-20 flex items-center justify-between shadow-sm px-4">
				<button
					on:click={() => {
						animator?.goBack();
					}}
					class="p-1 rounded-full hover:bg-base-200 mr-4"
				>
					<Icon icon="mingcute:down-line" class="text-xl" />
				</button>
				<h1 class="text-lg font-semibold">Follow Packs</h1>
				<span class="w-12" />
			</div>
			<div on:click|stopPropagation>
				<div class="px-4 pt-2">
					<div class="relative">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search follow packs..."
							class="outline-none w-full rounded-full px-4 bg-primary-content text-black placeholder-gray-600"
						/>
						{#if searchQuery}
							<button
								class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-base-200"
								on:click={() => (searchQuery = '')}
							>
								<Icon icon="mdi:close" class="text-lg" />
							</button>
						{/if}
					</div>
				</div>
				<div class="px-1">
					<MultiSelect
						selectedLists={fps}
						getTitle={(list) => {
							const kind39089 = asNip51(list);

							const title = kind39089?.title()?.toString() || '';
							return title.length > 20 ? title.slice(0, 20) + '...' : title;
						}}
						removeItem={(list) => {
							fps = fps.filter((p) => p.id()?.fnv1aHash() != list.id()?.fnv1aHash());
						}}
					/>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="header">
			<div>
				<div
					class="w-feed px-4 pt-safe border-primary-content h-20 flex items-center justify-between shadow-sm"
				>
					<button on:click={animator.goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
						<Icon icon="mingcute:down-line" class="text-xl" />
					</button>
					<h1 class="text-lg font-semibold">Follow Packs</h1>
					<span class="w-12" />
				</div>
				<div class="px-4 pb-3">
					<div class="relative">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search..."
							class="outline-none w-full rounded-full px-4 bg-primary-content text-black placeholder-gray-600"
						/>
						{#if searchQuery}
							<button
								class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-base-200"
								on:click={() => (searchQuery = '')}
							>
								<Icon icon="mdi:close" class="text-lg" />
							</button>
						{/if}
					</div>
				</div>
				<div class="px-1">
					<MultiSelect
						selectedLists={fps}
						getTitle={(list) => {
							const kind39089 = asNip51(list);

							const title = kind39089?.title()?.toString() || '';
							return title.length > 20 ? title.slice(0, 20) + '...' : title;
						}}
						removeItem={(list) => {
							fps = fps.filter((p) => p.id()?.fnv1aHash() != list.id()?.fnv1aHash());
						}}
					/>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="item-content" let:post let:visible>
			{@const kind39089 = asNip51(post)}
			{@const isSelected = fps.some((p) => p.id()?.toString() === post.id()?.toString())}
			{@const imageUrl = kind39089?.image()?.toString()}
			{@const hasValidImage = imageUrl && !imageUrl.startsWith('data:')}
			{@const isFollowList = post?.id?.()?.toString() === 'followlist'}
			<div
				class="cursor-pointer p-3 relative"
				on:click={() => toggleFollowPack(post)}
				role="button"
				tabindex="0"
			>
				<!-- Card container with selection border -->
				<div
					class="relative rounded-xl overflow-hidden bg-base-200 transition-all duration-200 {isSelected
						? 'ring-2 ring-primary shadow-lg shadow-primary/20'
						: 'hover:bg-base-100'}"
				>
					<!-- Hero Image Section -->
					<div class="relative h-32 w-full">
						{#if hasValidImage}
							<img
								src={imageUrl}
								alt={kind39089.title()?.toString()}
								class="w-full h-full object-cover"
								on:error={(e) => {
									e.currentTarget.style.display = 'none';
									e.currentTarget.nextElementSibling?.classList.remove('hidden');
								}}
							/>
							<div
								class="w-full h-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center hidden"
							>
								<Icon icon="mdi:image-off-outline" class="text-4xl text-base-content/40" />
							</div>
						{:else}
							<div
								class="w-full h-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center"
							>
								<Icon icon="mdi:image-off-outline" class="text-4xl text-base-content/40" />
							</div>
						{/if}

						<!-- Gradient overlay for text readability -->
						<div
							class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
						></div>

						<!-- Selection checkmark -->
						{#if isSelected}
							<div class="absolute top-3 right-3">
								<div
									class="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg"
								>
									<Icon icon="mdi:check" class="text-white text-lg" />
								</div>
							</div>
						{/if}

						<!-- Title and member count overlaid on image -->
						<div class="absolute bottom-0 left-0 right-0 p-3">
							<h3 class="text-lg font-bold text-white leading-tight">
								{kind39089?.title?.()?.toString()}
							</h3>
							{#if kind39089?.peopleLength() > 0}
								<span class="text-white/80 text-sm">{kind39089.peopleLength()} members</span>
							{/if}
						</div>
					</div>

					<!-- Content Section -->
					<div class="p-3">
						<!-- Description -->
						{#if kind39089?.description?.()?.toString()}
							{@const text = (() => {
								try {
									return JSON.parse('"' + kind39089.description?.()?.toString() + '"');
								} catch (e) {
									return kind39089.description?.()?.toString().replace(/\\/g, '');
								}
							})()}
							<p
								class="text-sm text-base-content/70 mb-3"
								style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"
							>
								{text}
							</p>
						{/if}

						<!-- Member avatars row -->
						{#if kind39089?.peopleLength() > 0}
							<div class="flex items-center justify-between">
								<div class="flex -space-x-2">
									{#each fbArray(kind39089, 'people').slice(0, 4) as p}
										<Avatar
											pubkey={p?.toString()}
											size="md"
											customClass="border-2 border-base-200"
										/>
									{/each}
									{#if kind39089?.peopleLength() > 4}
										<div
											class="w-7 h-7 rounded-full bg-base-300 border-2 border-base-200 flex items-center justify-center text-xs font-medium text-base-content/70"
										>
											+{kind39089?.peopleLength() - 4}
										</div>
									{/if}
								</div>
								{#if isSelected}
									<span class="text-xs text-primary font-medium">Selected</span>
								{:else}
									<span class="text-xs text-base-content/50">Tap to select</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</svelte:fragment>
	</Feed>
</div>
