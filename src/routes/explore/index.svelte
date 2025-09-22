<script lang="ts">
	import type { ConnectionStatus, Kind3Parsed } from '@candypoets/nipworker';
	import { asKind0, asKind3, fbArray } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import _, { uniq } from 'lodash';

	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { followPacks } from 'src/controller/feed';
	import { kind0, kind3Ready, readRelays } from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import { ago } from 'src/lib/period';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import Feed from 'src/routes/explore/feed.svelte';
	import Post from 'src/routes/explore/post.svelte';
	import { go } from 'src/routes/modals/modal';
	import Notifications from './notifications.svelte';

	export let visible = true;

	let wasRequested = false;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let feedRequests: any[] = [];
	let subs: string[] = [];

	$: following = uniq($followPacks.flatMap((pack) => pack.parsed?.people || []));

	$: visible && setFeedRequests(following);

	function setFeedRequests(follows: string[]) {
		kind3Ready.promise.then((kind3) => {
			if (follows.length == 0 && $followPacks.length)
				follows =
					fbArray(asKind3(kind3) as Kind3Parsed, 'contacts')
						?.map((c) => c.pubkey()?.toString())
						.filter(Boolean) || [];
			feedRequests = [
				{
					kinds: [1, 6],
					authors: follows,
					limit: $limit,
					since: ago(2 * 24 * 60 * 60),
					relays: $readRelays
				}
			];
		});
	}
</script>

<Pager rootPath="/explore" bind:subs>
	<Feed
		subscriptionID={$followPacks.reduce((acc, cur) => acc + cur.id()?.fnv1aHash(), '')}
		requests={feedRequests}
		kinds={[1, 6]}
		backdrop
		bind:connectionStatus
	>
		<svelte:fragment slot="sticky-header" let:newPosts>
			<div class="backdrop-blur-sm bg-base-300 bg-opacity-80 md:border-b border-base-200 pt-safe">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<div class="flex gap-1 items-center w-1/3">
						{#each $followPacks as pack}
							<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
								<img
									src={proxyAvatarUrl(pack.parsed?.image) || '/followlist.png'}
									class="w-8 h-8 border rounded-full"
									alt={pack.parsed?.title || 'Follow pack'}
								/>
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
								src={proxyAvatarUrl(asKind0($kind0)?.picture()?.toString()) || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</a>
					</div>
				</div>
			</div>
		</svelte:fragment>
		<svelte.fragment slot="sticky-footer">
			<div class="md:pb-4 pb-safe pt-0 backdrop-blur-md">
				<Post actionsOnTop />
			</div>
		</svelte.fragment>
		<svelte.fragment slot="header">
			<div class="relative pt-safe">
				<div class="w-feed lg:m-auto flex justify-between items-center h-16">
					<div class="flex gap-1 items-center">
						{#each $followPacks as pack}
							<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
								<img
									src={proxyAvatarUrl(pack.parsed?.image) || '/followlist.png'}
									class="w-8 h-8 border rounded-full"
									alt={pack.parsed?.title || 'Follow pack'}
								/>
							</div>
						{/each}
					</div>
					<div class="flex gap-2 items-center">
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<Notifications />
						<div class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={proxyAvatarUrl(asKind0($kind0)?.picture()?.toString()) || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</div>
					</div>
				</div>
			</div>
			<RelaysList relays={$readRelays} {connectionStatus} />
			<!-- <Post /> -->
		</svelte.fragment>
	</Feed>
</Pager>
