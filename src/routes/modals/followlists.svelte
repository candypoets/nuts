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

	$: console.log('followlist', $followList, asNip51($followList));

	console.log('parsedtype', $followList?.parsedType?.(), ParsedData.ListParsed);

	let seenEventIds = new Set<number>();
	let loading = false;

	let unsubscribe: (() => void) | undefined;

	function buildRequests(): RequestObject[] {
		return [
			{
				kinds: [39089],
				limit: 50,
				noCache: true,
				relays: []
			}
		];
	}

	function handleEvents(message: WorkerMessage) {
		const parsedEvent = isParsedEvent(message);
		if (!parsedEvent) return;

		const kindList = isNip51(message);
		if (!kindList) return;
		if (!kindList?.title()) return;

		const eventId = parsedEvent.id()?.fnv1aHash();
		if (!eventId) return;
		if (seenEventIds.has(eventId)) return;
		seenEventIds.add(eventId);

		// Don't add followlist (it's handled reactively via $followList)
		if (parsedEvent.id()?.toString() === 'followlist') return;

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
	});

	// Process feed: filter by search (parent handles search instead of Feed)
	$: processedFeed = feed.filter((item) => {
		if (!searchQuery) return true;
		const searchTerm = searchQuery.toLowerCase();
		const kind39089 = asNip51(item);
		const title = kind39089?.title?.()?.toString()?.toLowerCase() ?? '';
		const description = kind39089?.description?.()?.toString()?.toLowerCase() ?? '';
		return title.includes(searchTerm) || description.includes(searchTerm);
	});
</script>

<div class="h-full bg-base-300 bg-opacity-85 backdrop-blur-md lg:pt-4">
	<Feed
		items={processedFeed}
		getItemId={(item) => item?.id?.()?.fnv1aHash?.() ?? Math.random()}
		onNearBottom={() => console.log('near bottom')}
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
			<div
				class="cursor-pointer p-4 border-b border-primary-content relative"
				on:click={() => toggleFollowPack(post)}
				role="button"
				tabindex="0"
			>
				{#if fps.some((p) => p.id()?.toString() === post.id()?.toString())}
					<div class="absolute top-2 left-2">
						<Icon icon="mdi:check-circle" class="text-primary text-2xl" />
					</div>
				{/if}
				<div class="flex items-start gap-4 mb-4">
					{#if kind39089?.image()}
						<img
							src={proxyAvatarUrl(kind39089?.image()?.toString())}
							alt={kind39089.title()?.toString()}
							class="w-16 h-16 rounded-lg object-cover"
						/>
					{:else}
						<div class="w-16 h-16 rounded-lg bg-base-300 flex items-center justify-center">
							<span class="text-2xl">📝</span>
						</div>
					{/if}
					<div class="flex-grow">
						<div class="flex justify-between items-start">
							<h3 class="text-xl font-bold">{kind39089?.title?.()?.toString()}</h3>
							{#if kind39089?.peopleLength() > 0}
								<div class="">
									<!-- <h4 class="text-sm font-semibold mb-2">Members ({kind39089.peopleLength()})</h4> -->
									<div class="flex flex-wrap gap-2 items-center">
										<div class="flex -space-x-2">
											{#each fbArray(kind39089, 'people').slice(0, 5) as p}
												<Avatar pubkey={p?.toString()} />
											{/each}
										</div>
										{#if kind39089?.peopleLength() > 10}
											<div
												class="flex items-center justify-center px-1 -ml-3 rounded-full bg-base-300 text-sm font-medium"
											>
												+{kind39089?.peopleLength() - 10}
											</div>
										{/if}
									</div>
								</div>
							{/if}
						</div>
						{#if kind39089?.description?.()?.toString()}
							{@const text = (() => {
								try {
									// Attempt to unescape if the string has escaped sequences
									return JSON.parse('"' + kind39089.description?.()?.toString() + '"');
								} catch (e) {
									// If unescaping fails (e.g., due to control chars), use the raw text
									// Optionally remove all backslashes here if that's what you want
									return kind39089.description?.()?.toString().replace(/\\/g, ''); // Remove all '\' if desired
								}
							})()}
							<p class="text-base-content/70">{text}</p>
						{/if}
					</div>
				</div>
			</div>
		</svelte:fragment>
	</Feed>
</div>
