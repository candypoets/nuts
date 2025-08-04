<script lang="ts">
	import type { AnyKind, Kind39089Parsed, ParsedEvent, Request } from '@candypoets/nipworker';
	import { isKind39089 } from '@candypoets/nipworker/utils';

	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { followList, followPacks } from 'src/controller/feed';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import MultiSelect from 'src/routes/modals/components/MultiSelect.svelte';
	import { getContext } from 'svelte';

	let animator = getContext('animator');

	let searchQuery = '';
	let subscriptionID = 'starterpack';

	// Define fuseKeys for search
	const fuseKeys = ['0.parsed.title', '0.parsed.description'];

	let requests: Request[] = [
		{
			kinds: [39089],
			limit: 50,
			noContext: true,
			relays: []
		}
	];

	// Update feed function for kind 30000 events
	function updateFeed(
		currentFeed: [ParsedEvent<Kind39089Parsed>, ParsedEvent<AnyKind>[]][],
		newEvents: ParsedEvent<AnyKind>[],
		eventKind: 'EVENT' | 'EOSE' | 'EOCE'
	) {
		const [event, ...context] = newEvents;
		if (!event?.parsed || !isKind39089(event)) return currentFeed;

		// Ensure list has required fields
		if (!event.parsed.list_identifier || !event.parsed?.title) return currentFeed;

		// Add new event to feed if not already present
		if (!currentFeed.some((item) => item[0].id === event.id)) {
			return [...currentFeed, [event, context]];
		}

		return currentFeed;
	}

	function toggleFollowPack(pack: ParsedEvent<Kind39089Parsed>) {
		// Check if the pack is already in the list
		const packIndex = $followPacks.findIndex((p) => p.id === pack.id);

		if (packIndex !== -1) {
			// Pack exists, remove it
			$followPacks = $followPacks.filter((_, i) => i !== packIndex);
		} else {
			// Pack doesn't exist, add it
			$followPacks = [...$followPacks, pack];
		}
	}

	let initialItems = [[$followList]];
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
				class="backdrop-blur-md w-feed border-b border-base-200 h-16 flex items-center justify-between shadow-sm"
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
						selectedLists={$followPacks}
						getTitle={(item) => item?.parsed?.title || ''}
						removeItem={(list) => {
							$followPacks = $followPacks.filter((p) => p.id != list.id);
						}}
					/>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="header">
			<div>
				<div
					class="w-feed pt-safe border-b border-base-200 flex items-center justify-between shadow-sm"
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
						selectedLists={$followPacks}
						getTitle={(list) => list?.parsed?.title || ''}
						removeItem={(list) => {
							$followPacks = $followPacks.filter((p) => p.id != list.id);
						}}
					/>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="item-content" let:post let:context let:visible>
			<div
				class="cursor-pointer backdrop-blur-md p-4 border-b border-base-content hover:bg-base-300 hover:bg-opacity-90 transition-colors relative"
				on:click={() => toggleFollowPack(post)}
				role="button"
				tabindex="0"
			>
				{#if $followPacks.some((p) => p.id === post.id)}
					<div class="absolute top-2 right-2">
						<div class="badge badge-accent">Selected</div>
					</div>
				{/if}
				{#if post.parsed}
					<div class="flex items-center gap-4 mb-4">
						{#if post.parsed.image}
							<img
								src={proxyAvatarUrl(post.parsed.image)}
								alt={post.parsed.title}
								class="w-16 h-16 rounded-full object-cover"
							/>
						{:else}
							<div class="w-16 h-16 rounded-full bg-base-300 flex items-center justify-center">
								<span class="text-2xl">📝</span>
							</div>
						{/if}
						<div>
							<h3 class="text-xl font-bold">{post.parsed.title}</h3>
							{#if post.parsed.description}
								<p class="text-base-content/70">{post.parsed.description}</p>
							{/if}
						</div>
					</div>

					{#if post.parsed.people && post.parsed.people.length > 0}
						<div class="mt-4">
							<h4 class="text-sm font-semibold mb-2">Members ({post.parsed.people.length})</h4>
							<div class="flex flex-wrap gap-2 items-center">
								<div class="flex -space-x-2">
									{#each post.parsed.people.slice(0, 10) as pubkey}
										<Avatar {pubkey} />
									{/each}
								</div>
								{#if post.parsed.people.length > 10}
									<div
										class="flex items-center justify-center w-10 h-10 rounded-full bg-base-300 text-sm font-medium"
									>
										+{post.parsed.people.length - 10}
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<div class="mt-4 text-sm text-base-content/50">
						List ID: {post.parsed.list_identifier}
						<div class="float-right text-xs">
							Last updated {formatDistanceToNow(post.created_at * 1000, { addSuffix: true })}
						</div>
					</div>
				{/if}
			</div>
		</svelte:fragment>
	</Feed>
</div>
