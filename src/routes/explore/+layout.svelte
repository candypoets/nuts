<script lang="ts">
	import { posting } from 'src/stores';
	import { balance } from 'src/stores/wallet';
	import { getContext, onMount } from 'svelte';
	import Post from './post.svelte';
	import Reply from './reply.svelte';

	import { page } from '$app/stores';
	import { ago, DAY } from 'src/lib/period';
	import type { Kind0Parsed, Kind10002Parsed, Kind3Parsed } from 'src/parsers';
	import type { Writable } from 'svelte/store';
	import Feed from './feed.svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { viewport } from 'src/lib';
	import { goto } from '$app/navigation';

	let profileOpen: boolean = false;
	let feedRequests: any[] = [];

	let profile: Writable<Kind0Parsed | null> = getContext('profile');

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

	$: subs = $page.params.sub?.split('/').filter((sub) => sub !== '');

	$: tweenedValue = tweened(0, {
		duration: 400,
		easing: cubicOut
	});
	$: {
		if (subs && subs.length > 0) {
			tweenedValue.set(1);
		} else {
			tweenedValue.set(0);
		}
	}

	// Create a tweened store for the depth-based translation
	const depthTranslation = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	// Update the tweened value when depth changes
	$: depthTranslation.set(subs.length * 30); // 10px per depth level (adjust as needed)
</script>

<div
	style="transform: translateX({-$tweenedValue *
		($viewport.vw * 20 + $depthTranslation)}px) rotateY({$tweenedValue * -20}deg);
         transform-style: preserve-3d; perspective: 1000px;"
	on:click={() => goto('/explore')}
>
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
</div>

<slot />
<!-- <ProfileModal bind:open={profileOpen} /> -->
<Post bind:open={$posting} />
<Reply />
