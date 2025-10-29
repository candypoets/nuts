<script lang="ts">
	import type {
		ConnectionStatus,
		Kind39089Parsed,
		Kind3Parsed,
		RequestObject
	} from '@candypoets/nipworker';
	import { asKind0, asKind3, asKind39089, fbArray } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { isEqual, uniq } from 'lodash';

	import { normalizeURL } from 'nostr-tools/utils';
	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { key } from 'src/controller';
	import { followPacks } from 'src/controller/feed';
	import { kind0, kind3, readRelays } from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import { relaySub } from 'src/controller/relay';
	import { ago } from 'src/lib/period';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import Feed from 'src/routes/explore/feed.svelte';
	import { go } from 'src/routes/modals/modal';
	import Notifications from './notifications.svelte';

	export let visible = true;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let feedRequests: RequestObject[] = [];
	let subs: string[] = [];

	// Observable array of tags derived from the current URL.
	let tags: string[] = [];
	function extractTagsFromUrl(url: URL): string[] {
		const sp = url.searchParams;
		const out: string[] = [];

		// ?tag=foo (repeated allowed) and comma-separated lists ?tag=foo,bar
		for (const val of sp.getAll('tag')) {
			out.push(
				...val
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			);
		}
		// Optional support for ?tags=foo,bar as well
		for (const val of sp.getAll('tags')) {
			out.push(
				...val
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			);
		}
		// Support bare query keys like ?podcast (no value)
		sp.forEach((value, key) => {
			if (value === '' && sp.has(key)) out.push(key);
		});

		return Array.from(new Set(out));
	}

	$: follows =
		$kind3 && fbArray(asKind3($kind3) as Kind3Parsed, 'contacts').map((c) => c.pubkey().toString());

	$: following = uniq([
		...$followPacks.flatMap(
			(pack) =>
				fbArray(asKind39089(pack) as Kind39089Parsed, 'people').map((p) => p.toString()) || []
		),
		...(($followPacks.some((fp) => asKind39089(fp)?.title()?.toString() == 'followlist') &&
			follows) ||
			[])
	]);

	$: visible && setFeedRequests(following);

	$: subId =
		$followPacks.reduce((acc, cur) => acc + cur.id()?.fnv1aHash(), 'feed') + tags.join(',');

	$: relays = $readRelays;

	let relayCounter = 0;

	function handleSubRelays(subRelays: string[] | undefined) {
		if (subRelays && !isEqual(relays, subRelays)) {
			relays = subRelays;
			setFeedRequests(following);
			relayCounter += 1;
			connectionStatus = {};
		}
	}

	$: subId &&
		relaySub(subId).subscribe((subRelays) => {
			console.log(subRelays, subId);
			handleSubRelays(subRelays);
		});

	const setFeedRequests = (follows: string[]) => {
		if ($key?.pub) {
			feedRequests = [
				{
					kinds: [1, 6],
					authors: follows,
					limit: $limit,
					since: ago(31 * 24 * 60 * 60),
					noCache: !!relayCounter,
					tags: { '#t': tags },
					relays
				}
			];
		} else {
			feedRequests = [
				{
					kinds: [1, 6],
					authors: follows,
					limit: $limit,
					since: ago(31 * 24 * 60 * 60),
					noCache: !!relayCounter,
					tags: { '#t': tags },
					relays
				}
			];
		}
	};
</script>

<Pager rootPath="/explore" bind:subs>
	<Feed
		subscriptionID={subId + relayCounter}
		requests={feedRequests}
		kinds={[1, 6]}
		bind:connectionStatus
		pullToRefresh
	>
		<svelte:fragment slot="sticky-header" let:newPosts>
			<div class="backdrop-blur-sm bg-base-300 bg-opacity-80 md:border-b border-base-200 pt-safe">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<div class="flex gap-1 items-center w-1/3">
						{#each $followPacks as pack}
							{@const kind39039 = asKind39089(pack)}
							<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
								<img
									src={proxyAvatarUrl(kind39039?.image()?.toString()) || '/followlist.png'}
									class="w-8 h-8 border rounded-full"
									alt={kind39039?.title()?.toString() || 'Follow pack'}
									title={kind39039?.title()?.toString() || 'Follow pack'}
								/>
							</div>
						{:else}
							<div
								class="cursor-pointer"
								on:click|stopPropagation={() => go('followlists')}
								title="Follow lists"
							>
								<div class="w-8 h-8 border rounded-full flex items-center justify-center">
									<Icon icon="mdi:infinity" class="text-2xl" />
								</div>
							</div>
						{/each}
					</div>
					<div class="text-primary cursor-pointer flex-grow text-center">
						{#if newPosts}
							{newPosts} new posts
						{/if}
					</div>
					<div class="flex gap-2 items-center w-1/3 justify-end">
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<span class="cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
							<Icon icon="mdi:bell-outline" class="text-2xl mr-2" />
						</span>
						<a class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={proxyAvatarUrl(asKind0($kind0)?.picture()?.toString()) || '/miss-profile.png'}
								class="w-8 h-8 border rounded-full"
							/>
						</a>
					</div>
				</div>
			</div>
		</svelte:fragment>
		<svelte.fragment slot="sticky-footer">
			<div class="md:pb-4 pb-safe md:px-6 px-2">
				<div
					on:click|stopPropagation={(_) => go('post')}
					class="px-4 py-2 rounded-full backdrop-blur-2xl border border-accent"
				>
					What's up?
				</div>
			</div>
		</svelte.fragment>
		<svelte.fragment slot="header">
			<div
				class="w-feed relative pt-safe bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg pb-1 px-1 shadow-widget-down"
			>
				<div class="lg:m-auto flex justify-between items-center h-16">
					<div class="flex gap-1 items-center">
						{#each $followPacks as pack}
							{@const kind39039 = asKind39089(pack)}
							<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
								<img
									src={proxyAvatarUrl(kind39039?.image()?.toString()) || '/followlist.png'}
									class="w-8 h-8 border rounded-full"
									alt={kind39039?.title()?.toString() || 'Follow pack'}
								/>
							</div>
						{:else}
							<div
								class="cursor-pointer"
								on:click|stopPropagation={() => go('followlists')}
								title="Follow lists"
							>
								<div class="w-8 h-8 border rounded-full flex items-center justify-center">
									<Icon icon="mdi:infinity" class="text-2xl" />
								</div>
							</div>
						{/each}
					</div>
					<div class="flex gap-2 items-center">
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<Notifications />
						<div class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={proxyAvatarUrl(asKind0($kind0)?.picture()?.toString()) || '/miss-profile.png'}
								class="w-8 h-8 border rounded-full"
							/>
						</div>
					</div>
				</div>
				<RelaysList {subId} relays={relays.map(normalizeURL)} {connectionStatus} />
			</div>
			{#if tags.length}
				<div class="bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg pb-1 px-1 mt-1">
					<div class="flex gap-1 items-center">
						{#each tags as tag}
							<span
								class=" px-2 py-1 bg-base-200 rounded-full relative overflow-hidden text-primary"
							>
								#{tag}
							</span>
						{/each}
					</div>
				</div>
			{/if}
			<!-- <Post /> -->
		</svelte.fragment>
	</Feed>
</Pager>
