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

	let profile: Kind0Parsed | null = null;
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
					profile = event.parsed;
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

<div class="pt-16 w-feed mx-auto" id="top">
	{#if loading}
		<div class="flex justify-center py-10">
			<Icon icon="eos-icons:loading" width="32" height="32" />
		</div>
	{:else if profile}
		<div class="mb-6 px-4">
			<div class="flex items-center gap-3 mb-4">
				<img
					src={profile.picture || '/ns-naked.svg'}
					alt={profile.name || 'Profile'}
					class="w-16 h-16 rounded-full border"
				/>
				<div>
					<h2 class="text-xl font-bold">{profile.name || 'Unnamed'}</h2>
					<p class="text-gray-600">@{profile.nip05 || pubkey.substring(0, 8)}</p>
				</div>
			</div>
			{#if profile.about}
				<p class="text-gray-800 mb-4">{profile.about}</p>
			{/if}
		</div>

		<h3 class="text-lg font-medium mb-4 px-4">Posts</h3>
	{:else}
		<div class="text-center py-10 text-gray-500">
			<p>Profile not found</p>
		</div>
	{/if}
</div>
{#if feedRequests.length > 0}
	<Feed subscriptionID="profile_feed" requests={feedRequests} />
{/if}
