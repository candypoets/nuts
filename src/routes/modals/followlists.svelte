<script lang="ts">
	import { type ParsedEvent, type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asNip51, fbArray, isNip51, isParsedEvent } from '@candypoets/nipworker/utils';

	import Icon from '@iconify/svelte';
	import { followList, followPacks } from 'src/controller/feed';
	import { key } from 'src/controller/key';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import MultiSelect from 'src/routes/modals/components/MultiSelect.svelte';
	import { getContext, onDestroy, onMount } from 'svelte';

	let animator: PagerAnimator = getContext('animator');

	let searchQuery = '';
	let subscriptionID = 'followlists';

	let fps = $followPacks;

	// Separate arrays for different list types
	let followSets: ParsedEvent[] = []; // kind 30000 - user's follow sets
	let otherPacks: ParsedEvent[] = []; // kind 39089 - public follow packs

	// Combine in order: followList -> followSets -> otherPacks
	$: feed = [$followList, ...followSets, ...otherPacks];

	// Track seen event IDs separately for each kind to avoid duplicates
	let seenFollowSetIds = new Set<number>();
	let seenPackIds = new Set<number>();
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
		// Request both kind 30000 (Follow Sets) and kind 39089 (Follow Packs)
		const baseReq = {
			limit: 50,
			noCache: true,
			relays: []
		};

		// Only fetch the USER'S own follow sets (kind 30000) - these are personal lists
		const req30000: RequestObject = {
			...baseReq,
			kinds: [30000],
			authors: $key?.pub ? [$key.pub] : []
		};

		// Fetch follow packs (kind 39089) from anyone - these are public curated packs
		const req39089: RequestObject = {
			...baseReq,
			kinds: [39089]
		};

		if (isPagination && until) {
			req30000.until = until;
			req39089.until = until;
		}

		return [req30000, req39089];
	}

	function handleEvents(message: WorkerMessage) {
		const parsedEvent = isParsedEvent(message);
		if (!parsedEvent) {
			return;
		}

		const kindList = isNip51(message);
		if (!kindList) {
			return;
		}
		if (!kindList?.title()) {
			return;
		}

		const eventId = parsedEvent.id()?.fnv1aHash();
		if (!eventId) {
			return;
		}

		const kind = parsedEvent.kind();

		// Handle kind 30000 (Follow Sets)
		if (kind === 30000) {
			if (seenFollowSetIds.has(eventId)) {
				return;
			}
			seenFollowSetIds.add(eventId);
			followSets = [...followSets, parsedEvent].sort((a, b) => b.createdAt() - a.createdAt());
			loading = false;
			return;
		}

		// Handle kind 39089 (Follow Packs)
		if (kind === 39089) {
			// Don't add followlist (it's handled reactively via $followList)
			if (parsedEvent.id()?.toString() === 'followlist') {
				return;
			}
			if (seenPackIds.has(eventId)) {
				return;
			}
			seenPackIds.add(eventId);
			otherPacks = [...otherPacks, parsedEvent].sort((a, b) => b.createdAt() - a.createdAt());
			loading = false;
			return;
		}
	}

	onMount(() => {
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

	// Helper to determine if an item is a follow set (kind 30000)
	function isFollowSet(item: ParsedEvent): boolean {
		return item.kind() === 30000;
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

		// Check if we actually got new items (from both followSets and otherPacks)
		const newItemsAdded = followSets.length + otherPacks.length - itemsAtCheck;
		if (newItemsAdded === 0) {
			hasMore = false;
		}
		itemsBeforePagination = 0;
	}

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		const totalItems = followSets.length + otherPacks.length;
		if (loading || !hasMore || totalItems === 0) {
			return;
		}

		loading = true;
		itemsBeforePagination = followSets.length + otherPacks.length;
		paginationCounter++;

		// Use the createdAt of an item ~5 positions back as until (with overlap buffer)
		// This prevents gaps if the last few items arrived out of order
		// Combine both arrays for cursor calculation
		const allPacks = [...followSets, ...otherPacks];
		const overlapIndex = Math.max(0, allPacks.length - 6);
		const cursorItem = allPacks[overlapIndex];
		if (cursorItem) {
			until = cursorItem.createdAt() - 1;
		}

		const requests = buildRequests(true);
		const pageSubId = subscriptionID + '_page_' + paginationCounter + '_' + until;
		useSubscription(pageSubId, requests, handleEvents, {
			bytesPerEvent: 10 * 1024,
			pagination: prevPaginationSubId || subscriptionID
		});
		// Track this subId for next pagination
		prevPaginationSubId = pageSubId;

		// Fallback: clear loading after timeout if EOSE isn't received
		paginationTimeout = setTimeout(() => {
			loading = false;
		}, 10000);
	}

	// Process feed: filter by search, require images, and minimum members
	// Always include the user's followlist (id = "followlist")
	$: processedFeed = feed.filter((item) => {
		const kindList = asNip51(item);
		const itemId = item?.id?.()?.toString();
		const kind = item.kind();

		// Always include the user's followlist regardless of filters
		if (itemId === 'followlist') return true;

		// For follow sets (kind 30000), use less strict filtering
		// They may not have images set, and can have fewer members
		if (kind === 30000) {
			// Filter by search query only for follow sets
			if (!searchQuery) return true;
			const searchTerm = searchQuery.toLowerCase();
			const title = kindList?.title?.()?.toString()?.toLowerCase() ?? '';
			const description = kindList?.description?.()?.toString()?.toLowerCase() ?? '';
			return title.includes(searchTerm) || description.includes(searchTerm);
		}

		// For follow packs (kind 39089), apply stricter filters
		// Filter out packs without images
		if (!kindList?.image()) return false;
		// Filter out packs with less than 10 members
		if (kindList.peopleLength() < 10) return false;
		// Filter by search query
		if (!searchQuery) return true;
		const searchTerm = searchQuery.toLowerCase();
		const title = kindList?.title?.()?.toString()?.toLowerCase() ?? '';
		const description = kindList?.description?.()?.toString()?.toLowerCase() ?? '';
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
			{@const listData = asNip51(post)}
			{@const isSelected = fps.some((p) => p.id()?.toString() === post.id()?.toString())}
			{@const imageUrl = listData?.image()?.toString()}
			{@const hasValidImage = imageUrl && !imageUrl.startsWith('data:')}
			{@const isFollowList = post?.id?.()?.toString() === 'followlist'}
			{@const isFollowSet = post.kind() === 30000}
			{@const isFollowPack = post.kind() === 39089}
			{@const listTitle =
				listData?.title?.()?.toString() ||
				(isFollowSet ? listData?.listIdentifier?.()?.toString() : '')}
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
								alt={listTitle}
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

						<!-- Kind badge (Follow Set vs Follow Pack) -->
						<div class="absolute top-3 left-3">
							{#if isFollowSet}
								<span
									class="px-2 py-1 rounded-full bg-accent/80 text-white text-xs font-medium backdrop-blur-sm"
								>
									Follow Set
								</span>
							{:else if isFollowPack}
								<span
									class="px-2 py-1 rounded-full bg-secondary/80 text-white text-xs font-medium backdrop-blur-sm"
								>
									Pack
								</span>
							{/if}
						</div>

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
								{listTitle || 'Unnamed List'}
							</h3>
							{#if listData?.peopleLength() > 0}
								<span class="text-white/80 text-sm">{listData.peopleLength()} members</span>
							{/if}
						</div>
					</div>

					<!-- Content Section -->
					<div class="p-3">
						<!-- Description -->
						{#if listData?.description?.()?.toString()}
							{@const text = (() => {
								try {
									return JSON.parse('"' + listData.description?.()?.toString() + '"');
								} catch (e) {
									return listData.description?.()?.toString().replace(/\\/g, '');
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
						{#if listData?.peopleLength() > 0}
							<div class="flex items-center justify-between">
								<div class="flex -space-x-2">
									{#each fbArray(listData, 'people').slice(0, 4) as p}
										<Avatar
											pubkey={p?.toString()}
											size="md"
											customClass="border-2 border-base-200"
										/>
									{/each}
									{#if listData?.peopleLength() > 4}
										<div
											class="w-7 h-7 rounded-full bg-base-300 border-2 border-base-200 flex items-center justify-center text-xs font-medium text-base-content/70"
										>
											+{listData?.peopleLength() - 4}
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
