<script lang="ts">
	import type { ParsedEvent, RequestObject, WorkerMessage } from '@candypoets/nipworker';
	import { asKind39089, fbArray, isKind39089, isParsedEvent } from '@candypoets/nipworker/utils';

	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { followList, followPacks } from 'src/controller/feed';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import MultiSelect from 'src/routes/modals/components/MultiSelect.svelte';
	import { getContext, onDestroy } from 'svelte';

	let animator: PagerAnimator = getContext('animator');

	let searchQuery = '';
	let subscriptionID = 'starterpack';

	let fps = $followPacks;

	// Define fuseKeys for search
	const fuseKeys = ['0.parsed.title', '0.parsed.description'];

	let requests: RequestObject[] = [
		{
			kinds: [39089],
			limit: 50,
			noContext: true,
			relays: []
		}
	];

	// Update feed function for kind 30000 events
	function updateFeed(currentFeed: ParsedEvent[], message: WorkerMessage): ParsedEvent[] {
		const parsedEvent = isParsedEvent(message);
		const kind39089 = isKind39089(message);
		if (!kind39089) return currentFeed;

		// Ensure list has required fields
		if (!kind39089.listIdentifier() || !kind39089?.title()) return currentFeed;

		return [...currentFeed, parsedEvent as ParsedEvent].sort(
			(a, b) => b.createdAt() - a.createdAt()
		);
	}

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
		if (fps.length == 0) {
			fps.push($followList);
		}
		$followPacks = fps;
	});

	let initialItems = [$followList];
</script>

<div class="h-full bg-base-300 bg-opacity-85 lg:pt-4">
	<Feed
		{subscriptionID}
		{requests}
		{updateFeed}
		{initialItems}
		visible
		search={searchQuery}
		{fuseKeys}
	>
		<svelte:fragment slot="sticky-header">
			<div
				class="backdrop-blur-md pt-safe w-feed border-b border-base-200 h-16 flex items-center justify-between shadow-sm"
			>
				<button
					on:click={() => {
						animator?.goBack();
					}}
					class="p-1 rounded-full hover:bg-base-200 mr-4"
				>
					<Icon icon="mdi:arrow-left" class="text-xl" />
				</button>
				<h1 class="text-lg font-semibold">Follow Packs</h1>
				<span />
			</div>
			<div on:click|stopPropagation class="backdrop-blur-md">
				<div class="px-4 pt-2">
					<div class="relative">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search follow packs..."
							class="input input-bordered w-full"
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
							const kind39089 = asKind39089(list);

							return kind39089?.title()?.toString() || '';
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
					class="w-feed pt-safe border-b border-base-200 h-16 flex items-center justify-between shadow-sm"
				>
					<button on:click={animator.goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
						<Icon icon="mdi:arrow-left" class="text-xl" />
					</button>
					<h1 class="text-lg font-semibold">Follow Packs</h1>
					<span class="w-12" />
				</div>
				<div class="px-4 pt-2">
					<div class="relative">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search follow packs..."
							class="input input-bordered w-full"
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
							const kind39089 = asKind39089(list);

							return kind39089?.title()?.toString() || '';
						}}
						removeItem={(list) => {
							fps = fps.filter((p) => p.id()?.fnv1aHash() != list.id()?.fnv1aHash());
						}}
					/>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="item-content" let:post let:visible>
			{@const kind39089 = asKind39089(post) || post}
			<div
				class="cursor-pointer backdrop-blur-md p-4 border-b border-base-content hover:bg-base-300 hover:bg-opacity-90 transition-colors relative"
				on:click={() => toggleFollowPack(post)}
				role="button"
				tabindex="0"
			>
				{#if fps.some((p) => p.id()?.toString() === post.id()?.toString())}
					<div class="absolute top-2 right-2">
						<Icon icon="mdi:check" class="text-accent text-2xl" />
					</div>
				{/if}
				<div class="flex items-center gap-4 mb-4">
					{#if kind39089.image()}
						<img
							src={proxyAvatarUrl(kind39089.image()?.toString())}
							alt={kind39089.title()?.toString()}
							class="w-16 h-16 rounded-full object-cover"
						/>
					{:else}
						<div class="w-16 h-16 rounded-full bg-base-300 flex items-center justify-center">
							<span class="text-2xl">📝</span>
						</div>
					{/if}
					<div>
						<h3 class="text-xl font-bold">{kind39089.title?.()?.toString()}</h3>
						{#if kind39089.description?.()?.toString()}
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

				{#if kind39089.peopleLength() > 0}
					<div class="mt-4">
						<h4 class="text-sm font-semibold mb-2">Members ({kind39089.peopleLength()})</h4>
						<div class="flex flex-wrap gap-2 items-center">
							<div class="flex -space-x-2">
								{#each fbArray(kind39089, 'people').slice(0, 10) as p}
									<Avatar pubkey={p?.toString()} />
								{/each}
							</div>
							{#if kind39089.peopleLength() > 10}
								<div
									class="flex items-center justify-center w-10 h-10 rounded-full bg-base-300 text-sm font-medium"
								>
									+{kind39089.peopleLength() - 10}
								</div>
							{/if}
						</div>
					</div>

					<div class="mt-4 text-sm text-base-content/50">
						List ID: {kind39089.listIdentifier()?.toString()}
						<div class="float-right text-xs">
							Last updated {formatDistanceToNow(post.createdAt() * 1000, {
								addSuffix: true
							})}
						</div>
					</div>
				{/if}
			</div>
		</svelte:fragment>
	</Feed>
</div>
