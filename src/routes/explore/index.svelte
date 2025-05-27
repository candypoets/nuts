<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';

	import Pager from 'src/components/Pager.svelte';
	import { kind0, kind3 } from 'src/controller/nostr';
	import { balance } from 'src/controller/wallet';
	import { ago, DAY } from 'src/lib/period';
	import Feed from 'src/routes/explore/feed.svelte';
	import Post from 'src/routes/explore/post.svelte';
	import { go } from '../modals/modal';
	import type { AnyKind, ParsedEvent } from 'src/types';
	import type { SubscribeKind } from 'src/model/nostr';
	import Note from './note.svelte';
	import MultiSelect from '../modals/components/MultiSelect.svelte';
	import { followPacks } from 'src/controller/feed';
	import _ from 'lodash';

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
				kinds: [1, 6, 0, 10002], // take another chance to cache 0 and 10002 events for the followlist
				authors: follows,
				limit: 750,
				relays: [
					'wss://relay.primal.net',
					'wss://nostr.land',
					'wss://premium.primal.net',
					'wss://relay.damus.io'
				]
			}
		];
	}

	$: console.log('following', following, feedRequests);
</script>

<Pager rootPath="/explore" bind:subs>
	<Feed subscriptionID="main_feed" requests={feedRequests} kinds={[1, 6]} backdrop>
		<svelte:fragment slot="sticky-header" let:newPosts>
			<div
				id={$page.url.pathname === '/explore' ? 'top' : undefined}
				class="backdrop-blur border-b border-base-200 unsafe-padding-top"
			>
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold flex gap-2 items-center">
						<span class="cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
							<Icon icon="mdi:bell" class="mr-2" />
						</span>
						<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
							Explore
						</div>
					</h1>
					<div class="text-primary cursor-pointer">
						{#if newPosts}
							{newPosts} new posts
						{/if}
					</div>
					<div class="flex gap-2 items-center">
						<span class="text font-semibold">{$balance} Sats</span>
						<a class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={$kind0?.parsed?.picture || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</a>
					</div>
				</div>
			</div>
			<div class="backdrop-blur-md" on:click|stopPropagation>
				<div class="w-feed lg:m-auto">
					<MultiSelect
						selectedLists={$followPacks}
						getTitle={(item) => item.parsed?.title}
						removeItem={(list) => {
							$followPacks = $followPacks.filter((p) => p.id != list.id);
						}}
					/>
				</div>
				<Post />
			</div>
		</svelte:fragment>
		<svelte.fragment slot="header">
			<div
				class="relative unsafe-padding-top unsafe-padding-top"
				id={$page.url.pathname === '/explore' ? 'top' : undefined}
			>
				<div class="w-feed lg:m-auto flex justify-between h-16 items-center">
					<h1 class="text-2xl font-semibold flex gap-2 items-center">
						<span class="cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
							<Icon icon="mdi:bell" class="mr-2" />
						</span>
						<div
							class="cursor-pointer flex items-center"
							on:click|stopPropagation={() => go('followlists')}
						>
							Explore
							<Icon icon="mdi:arrow-down-drop" class="ml-1" />
						</div>
					</h1>
					<div class="flex gap-2 items-center">
						<span class="text font-semibold">{$balance} Sats</span>
						<div class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={$kind0?.parsed?.picture || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="w-feed lg:m-auto">
				<MultiSelect
					selectedLists={$followPacks}
					getTitle={(item) => item.parsed?.title}
					removeItem={(list) => {
						$followPacks = $followPacks.filter((p) => p.id != list.id);
					}}
				/>
			</div>
			<Post />
		</svelte.fragment>
	</Feed>
</Pager>
