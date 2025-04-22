<script lang="ts">
	import { balance } from 'src/stores/wallet';
	import Post from './post.svelte';

	import { page } from '$app/stores';
	import Pager from 'src/comp/Pager.svelte';
	import { kind0, kind3 } from 'src/controller/nostr';
	import { ago, DAY } from 'src/lib/period';
	import Feed from 'src/routes/explore/feed.svelte';

	let feedRequests: any[] = [];

	$: {
		if ($kind3?.parsed && $kind3?.parsed.length) {
			feedRequests = $kind3?.parsed.map((c) => ({
				kinds: [1],
				authors: [c.pubkey],
				relays: c.relays || [],
				since: ago(2 * DAY)
			}));
		}
	}
</script>

<Pager rootPath="/explore">
	<Feed subscriptionID="main_feed" requests={feedRequests} headerItem={{ id: 'header' }}>
		<svelte:fragment slot="sticky-header">
			<div
				id={$page.url.pathname === '/explore' ? 'top' : undefined}
				class="backdrop-blur bg-base-100 bg-opacity-90"
			>
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold">Explore</h1>
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
		<svelte.fragment slot="header-content" let:item>
			<div id={$page.url.pathname === '/explore' ? 'top' : undefined}>
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold">Explore</h1>
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
