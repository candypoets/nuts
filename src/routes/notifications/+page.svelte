<script lang="ts">
	import { ago, DAY } from 'src/lib/period';
	import Feed from 'src/routes/explore/feed.svelte';
	import { key } from 'src/stores/db';
	import { onMount } from 'svelte';

	let loading = true;

	$: feedRequests =
		($key && [
			// Mentions of user, reactions to user's posts, reposts of user's content
			{
				kinds: [1, 7, 6],
				'#p': [$key?.pub],
				limit: 20,
				since: ago(7 * DAY)
			}
		]) ||
		[];
	onMount(() => {
		window.scrollTo(0, 0);
	});
</script>

<Feed subscriptionID={`notifications`} requests={feedRequests} />
