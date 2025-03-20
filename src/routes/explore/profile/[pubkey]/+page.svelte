<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import { updateVc } from 'src/lib';
	import { ago, DAY } from 'src/lib/period';
	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/parsers';
	import Feed from 'src/routes/explore/feed.svelte';
	import { nostrManager } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onMount } from 'svelte';

	// Get pubkey from URL parameter
	const pubkey = $page.params.pubkey;

	let profile: ParsedEvent<Kind0Parsed> | undefined;
	let loading = true;
	let feedRequests: any[] = [];

	onMount(() => {
		window.scrollTo(0, 0);
		updateVc();
		const sub = nostrManager.subscribe(
			'profile',
			[{ kinds: [0], authors: [pubkey], limit: 1, relays: [], cacheFirst: true }],
			(events: ParsedEvent<AnyKind>[]) => {
				const [event] = events;
				if (!event.parsed) return;
				if (isKind0(event)) {
					loading = false;
					// console.log('note events', note?.id, randomId, events, context);
					profile = event;
					feedRequests = [
						{
							kinds: [1],
							authors: [pubkey],
							limit: 500,
							since: ago(30 * DAY)
						}
					];
				}
			}
		);
		return sub;
	});
</script>

{#if feedRequests.length > 0}
	<Feed subscriptionID="profile_feed" requests={feedRequests} headerItem={profile}>
		<div slot="header-content" let:item>
			{@const p = item.parsed}
			<div class="mb-6 px-4">
				<div class="flex items-center gap-3 mb-4">
					<img
						src={p.picture || '/ns-naked.svg'}
						alt={p.name || 'Profile'}
						class="w-16 h-16 rounded-full border"
					/>
					<div>
						<h2 class="text-xl font-bold">{p.name || 'Unnamed'}</h2>
						<p class="text-gray-600">@{p.nip05 || pubkey.substring(0, 8)}</p>
					</div>
				</div>
				{#if p.about}
					<p class="text-gray-800 mb-4">{p.about}</p>
				{/if}
			</div>

			<h3 class="text-lg font-medium mb-4 px-4">Posts</h3>
		</div>
	</Feed>
{/if}
