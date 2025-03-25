<script lang="ts">
	import { ago, DAY } from 'src/lib/period';
	import type { Kind3Parsed, Kind10002Parsed } from 'src/parsers';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import Feed from './feed.svelte';
	import { page } from '$app/stores';
	import { balance } from 'src/stores/wallet';
	import { profile } from 'src/stores/profile';

	let feedRequests: any[] = [];

	let followList: Writable<Kind3Parsed> = getContext('followList');
	let outboxList: Writable<Kind10002Parsed[]> = getContext('outboxList');

	$: {
		if ($followList && $followList.length) {
			feedRequests = $followList.map((c) => ({
				kinds: [1],
				authors: [c.pubkey],
				relays: c.relays || [],
				since: ago(2 * DAY)
			}));
		}
	}
</script>

<Feed subscriptionID="main_feed" requests={feedRequests} headerItem={{ id: 'header' }}>
	<svelte:fragment slot="sticky-header">
		<div id={$page.url.pathname === '/explore' ? 'top' : undefined}>
			<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
				<h1 class="text-2xl font-semibold">Explore</h1>
				<div class="flex gap-2 items-center">
					<span class="text font-semibold">{$balance} Sats</span>
					<div class="cursor-pointer">
						<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
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
						<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
					</div>
				</div>
			</div>
		</div>
	</svelte.fragment>
</Feed>
