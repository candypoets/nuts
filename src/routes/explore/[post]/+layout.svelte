<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';

	import VirtualList from 'src/comp/VirtualList.svelte';
	import Replypost from '../post/reply-post.svelte';
	import NIP10Worker from 'src/workers/nip10?worker';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { swipe, type SwipeCustomEvent } from 'src/actions/swipe';
	import { quintOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { spring } from 'svelte/motion';
	import { handler } from 'src/handlers';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import type { Nip10Params, NIP10Parsed } from 'src/workers/nip10';
	import { getRelaysFromNote } from 'src/lib/getRelaysFromNote';
	import _ from 'lodash';
	import { getEvent, nostrDb } from 'src/db';

	let nip10: Worker | undefined;

	let start = 0;

	let postElement: HTMLElement;

	let selectedReply: ParsedEvent<NIP10Parsed>;

	let replies: ParsedEvent<NIP10Parsed>[] = [];

	async function fetchReplies() {
		nip10?.postMessage({ type: 'UNSUBSCRIBE' });
		nip10?.terminate();
		nip10 = undefined;
		replies = [];
		const db = await nostrDb;
		selectedReply = (await getEvent(db, $page.params.post)) as ParsedEvent<NIP10Parsed>;
		const relays = selectedReply && (await getRelaysFromNote(selectedReply));
		if (!nip10) nip10 = new NIP10Worker();

		nip10?.postMessage({
			'#e': [$page.params.post],
			relays: relays || note?.relays,
			limit: 150
		} as Nip10Params);

		for await (const data of handler<NIP10Parsed>(nip10)) {
			if (!data.parsed) continue;
			// filter out deep replies
			if (data?.parsed?.reply?.id == $page.params.post) continue;
			// if (!data?.parsed.root) continue;
			// console.log('data', data);
			replies = _.uniqBy([data, ...replies], 'id').sort((a, b) => b.created_at - a.created_at);
		}
	}

	$: {
		if ($page.params.post) {
			fetchReplies();
		}
	}

	onMount(() => {
		return () => {
			nip10?.postMessage({ type: 'UNSUBSCRIBE' });
			nip10?.terminate();
		};
	});

	$: items = [selectedReply, ...(replies || [])];

	const translateX = spring(0, {
		stiffness: 0.3,
		damping: 0.8
	});

	function onSwipe(event: SwipeCustomEvent) {
		translateX.set(event.detail.deltaX, { hard: true });
	}

	function end(event: SwipeCustomEvent) {
		if ($translateX > postElement.clientWidth / 2) {
			// goto('/explore');
			$translateX = postElement.clientWidth;
			setTimeout(() => {
				goto('/explore');
			}, 300);
		} else {
			$translateX = 0;
		}
	}
</script>

<div
	class="fixed top-0 right-0 overflow-hidden z-10 lg:border-l lg:pl-2"
	transition:slide={{ duration: 300, easing: quintOut, axis: 'x' }}
	style="transform: translateX({$translateX}px);"
	bind:this={postElement}
	use:swipe
	on:swipe={onSwipe}
	on:end={end}
>
	<div class="max-h-screen z-10 lg:w-25vw w-100vw bg-basic safe-padding-top">
		<div class="flex justify-between items-center lg:pl-0 px-4 pb-4">
			<a href="/explore">
				<Icon icon="mingcute:left-line" class="text-xl" />
			</a>
			<!-- <div /> -->
			<h1 class="text-xl font-semibold">Post</h1>
			<div />
		</div>
		{#if selectedReply}
			<div class="container-height lg:h-screen pb-20 !pt-0">
				<!-- <div class="h-screen"> -->
				<VirtualList {items} bind:start let:item getItemId={(item) => item.data.id}>
					<Replypost
						note={item}
						full={(replies || []).findIndex((note) => note.id === item.id) == -1}
						visible={(replies || []).findIndex((note) => note.id === item.id) >= start - 2}
					/>
				</VirtualList>
			</div>
		{:else}
			<div
				class="lg:pt-0 overflow-scroll scrollbar-hide container-height lg:container-height m-auto !pt-0"
			>
				{#each Array(8) as _}
					<div class="lg:hover:bg-base-200 rounded-md pt-2 px-1 mb-4">
						<div class="flex items-center mb-2">
							<div class="w-10 h-10 rounded-full shimmer"></div>
							<div class="ml-2 flex-grow">
								<div class="h-4 rounded w-1/4 shimmer"></div>
								<div class="h-3 rounded w-1/3 mt-1 shimmer"></div>
							</div>
						</div>
						<div class="h-16 rounded shimmer"></div>
						<div class="flex justify-between mt-2">
							<div class="h-4 rounded w-1/6 shimmer"></div>
							<div class="h-4 rounded w-1/6 shimmer"></div>
							<div class="h-4 rounded w-1/6 shimmer"></div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
<slot />

<!-- <Subpost bind:selectedReply /> -->
<style>
	@media (min-width: 1024px) {
		.lg\:w-25vw {
			width: 25vw !important;
		}
	}
	.w-100vw {
		width: 100vw;
	}
</style>
