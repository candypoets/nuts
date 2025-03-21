<script lang="ts">
	import { ago, DAY } from 'src/lib/period';
	import type { Kind3Parsed, Kind10002Parsed } from 'src/parsers';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import Feed from './feed.svelte';

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
	$: console.log(feedRequests);
</script>

<Feed subscriptionID="main_feed" requests={feedRequests} />
