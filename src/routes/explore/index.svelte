<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';

	import _ from 'lodash';
	import Pager from 'src/components/Pager.svelte';
	import { followPacks } from 'src/controller/feed';
	import { kind0, readRelays } from 'src/controller/nostr';
	import { balance } from 'src/controller/wallet';
	import Feed from 'src/routes/explore/feed.svelte';
	import Post from 'src/routes/explore/post.svelte';
	import MultiSelect from '../modals/components/MultiSelect.svelte';
	import { go } from 'src/routes/modals/modal';
	import { limit } from 'src/controller/pagination';
	import { ago } from 'src/lib/period';
	import Notifications from './notifications.svelte';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import RelaysList from 'src/components/RelaysList.svelte';

	export let visible = true;

	let feedRequests: any[] = [];
	let subs: string[] = [];

	$: following = _.uniq($followPacks.flatMap((pack) => pack.parsed?.people || []));

	$: setFeedRequests(following);

	function setFeedRequests(follows: string[]) {
		if (following.length == 0) {
			feedRequests = [];
			return;
		}
		feedRequests = [
			{
				kinds: [1, 6],
				authors: follows,
				limit: $limit,
				since: ago(2 * 24 * 60 * 60),
				relays: $readRelays
			},
			{
				kinds: [10002], // take another chance to cache 0 and 10002 events for the followlist
				authors: follows,
				limit: follows.length,
				relays: [
					'wss://relay.primal.net',
					'wss://nostr.land',
					'wss://premium.primal.net',
					'wss://relay.damus.io'
				]
			}
		];
	}
</script>

<Pager rootPath="/explore" bind:subs>
	<Feed
		subscriptionID={$followPacks.reduce((acc, cur) => acc + cur.id, '')}
		requests={feedRequests}
		kinds={[1, 6]}
		backdrop
	>
		<svelte:fragment slot="sticky-header" let:newPosts>
			<div
				id={$page.url.pathname === '/explore' ? 'top' : undefined}
				class="backdrop-blur-sm bg-base-300 bg-opacity-80 md:border-b border-base-200 safe-padding-top"
			>
				<div class="flex justify-between w-feed lg:m-auto md:h-16 items-center">
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
					<div class="text-primary cursor-pointer">
						{#if newPosts}
							{newPosts} new posts
						{/if}
					</div>
					<div class="flex gap-2 items-center">
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<span class="cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
							<Icon icon="mdi:bell-outline" class="text-2xl mr-2" />
						</span>
						<a class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={$kind0?.parsed?.picture || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</a>
					</div>
				</div>
			</div>
		</svelte:fragment>
		<svelte.fragment slot="sticky-footer">
			<div class="m-safe py-4">
				<Post actionsOnTop />
			</div>
		</svelte.fragment>
		<svelte.fragment slot="header">
			<div
				class="relative md:pt-4 unsafe-padding-top"
				id={$page.url.pathname === '/explore' ? 'top' : undefined}
			>
				<div class="w-feed lg:m-auto flex justify-between items-center pb-4">
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
								src={$kind0?.parsed?.picture || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</div>
					</div>
				</div>
			</div>
			<RelaysList relays={$readRelays} />
			<!-- <Post /> -->
		</svelte.fragment>
	</Feed>
</Pager>
