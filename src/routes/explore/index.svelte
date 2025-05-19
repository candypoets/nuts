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

	let feedRequests: any[] = [];

	$: {
		if ($kind3?.parsed && $kind3?.parsed.length) {
			feedRequests = $kind3?.parsed.map((c) => ({
				kinds: [1, 6],
				authors: [c.pubkey],
				relays: c.relays || [],
				since: ago(2 * DAY)
			}));
		}
	}
</script>

<Pager rootPath="/explore">
	<Feed subscriptionID="main_feed" requests={feedRequests} kinds={[1, 6]} backdrop>
		<svelte:fragment slot="sticky-header" let:newPosts>
			<div id={$page.url.pathname === '/explore' ? 'top' : undefined} class="backdrop-blur -px-2">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold flex gap-2 items-center">
						<span class="cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
							<Icon icon="mdi:bell" class="mr-2" />
						</span>
						<div>Explore</div>
					</h1>
					<div class="text-primary cursor-pointer">
						{#if newPosts}
							{newPosts} new posts
						{/if}
					</div>
					<div class="flex gap-2 items-center">
						<span class="text font-semibold">{$balance} Sats</span>
						<div class="cursor-pointer">
							<img
								src={$kind0?.parsed?.picture || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</div>
					</div>
				</div>
			</div>
		</svelte:fragment>
		<svelte.fragment slot="header">
			<div class="relative" id={$page.url.pathname === '/explore' ? 'top' : undefined}>
				<div class="w-feed lg:m-auto flex justify-between h-16 items-center">
					<h1 class="text-2xl font-semibold flex gap-2 items-center">
						<span class="cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
							<Icon icon="mdi:bell" class="mr-2" />
						</span>
						<div>Explore</div>
					</h1>
					<div class="flex gap-2 items-center">
						<span class="text font-semibold">{$balance} Sats</span>
						<div class="cursor-pointer">
							<img
								src={$kind0?.parsed?.picture || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</div>
					</div>
				</div>
			</div>
			<Post />
		</svelte.fragment>
	</Feed>
</Pager>
