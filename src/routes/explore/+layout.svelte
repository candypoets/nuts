<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import VirtualList from 'src/comp/VirtualList.svelte';
	import { updateVc } from 'src/lib';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import { posting } from 'src/stores';
	import { balance } from 'src/stores/wallet';
	import { getContext, onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Post from './post.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';
	import Header from './post/header.svelte';
	import Reply from './reply.svelte';
	import NIP10Worker from 'src/workers/nip10?worker';
	import { handler } from 'src/handlers';
	import type { NIP01Parsed } from 'src/workers/nip01';
	import type { NIP02Parsed } from 'src/workers/nip02';
	import type { Nip10Params, NIP10Parsed } from 'src/workers/nip10';
	import { ago, DAY } from 'src/lib/period';
	import type { Writable } from 'svelte/store';
	import type { NostrEvent } from 'nostr-tools';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import Note from './note.svelte';
	import type { NIP65Parsed } from 'src/workers/nip65';
	import Zap from './post/zap.svelte';

	let nip10: Worker | undefined;

	let feed: ParsedEvent<NIP10Parsed>[] = [];
	let newPosts: ParsedEvent<NIP10Parsed>[] = [];

	let start = 0;
	let end = 0;

	let viewport: HTMLElement;

	let profileOpen: boolean = false;

	let top: number = 0;

	let oldTop = 0;

	let topper: HTMLElement;
	let footer: HTMLElement;

	let profile: Writable<NIP01Parsed | null> = getContext('profile');
	let followList: Writable<NIP02Parsed> = getContext('followList');
	let outboxList: Writable<NIP02Parsed> = getContext('outboxList');
	let nip65s: Writable<ParsedEvent<NIP65Parsed>[]> = getContext('nip65s');

	let feedMap: Map<string, ParsedEvent<NIP10Parsed> | boolean> = new Map();

	$: {
		if ($outboxList.length) {
			nip10?.postMessage({ type: 'UNSUBSCRIBE' });
			nip10?.terminate();
			nip10 = undefined;
			fetchFeeds();
		}
		// } else if ($followList.length) {
		// 	console.log('follow fetching');
		// 	nip10?.terminate();
		// 	nip10 = new NIP10Worker();
		// 	nip10?.postMessage({ pubkeys: $followList, since: ago(2 * DAY), limit: 150 } as Nip10Params);
		// }
	}

	async function fetchFeeds() {
		if (!nip10) nip10 = new NIP10Worker();
		nip10?.postMessage({ pubkeys: $outboxList, since: ago(2 * DAY), limit: 150 } as Nip10Params);
		for await (const data of handler<NIP10Parsed>(nip10)) {
			if (!data.parsed || feedMap.has(data.id)) continue;
			// filter out deep replies
			if (data?.parsed?.reply?.id && data?.parsed.root?.id != data?.parsed?.reply?.id) continue;

			if (data?.parsed.root?.id) feedMap.set(data.parsed.root.id, true);
			feedMap.set(data.id, data);
			feed = Array.from(feedMap.values())
				.filter((p) => p!.created_at)
				.sort((a, b) => b.created_at - a.created_at);
		}
	}

	onMount(() => {
		nip10 = new NIP10Worker();
		topper = document.getElementById('top');
		footer = document.getElementById('footer');
		updateVc();

		return () => {
			nip10?.postMessage({ type: 'UNSUBSCRIBE' });
			nip10?.terminate();
		};
	});
	let fadein = false;
	$: {
		// console.log(topper, footer);
		top > oldTop;

		if (top > oldTop + 25) {
			topper?.classList.add('toggle-up');
			footer?.classList.add('blur-in');
			fadein = true;
			oldTop = top;
			// prevScrollPos = currentScrollPos;
		} else if (top < oldTop - 25) {
			topper?.classList.remove('toggle-up');
			footer?.classList.remove('blur-in');
			fadein = false;
			oldTop = top;
			// prevScrollPos = currentScrollPos;
		} else if (top == 0) {
			topper?.classList.remove('toggle-up');
			footer?.classList.remove('blur-in');
			fadein = false;
			oldTop = top;
			// prevScrollPos = currentScrollPos;
		}
	}
</script>

<div
	class="px-4 lg:px-0 lg:w-full w-full m-auto p-2 lg:mt-0 fixed bg-basic z-10"
	on:click={() => viewport.scrollTo({ top: 0, behavior: 'smooth' })}
	id="top"
>
	<div class="flex justify-between items-start lg:w-1/3 lg:m-auto lg:relative">
		<div class="absolute top-6 w-full z-40" transition:fly={{ y: -50, duration: 300 }}>
			{#if newPosts.length}
				<div
					class="flex justify-center cursor-pointer"
					on:click={() => {
						viewport.scrollTo({ top: 0, behavior: 'smooth' });
						feed = _.uniqBy([...newPosts, ...feed], 'id');
						newPosts = [];
					}}
				>
					<div class="bg-primary text-white text-sm py-1 px-2 rounded-lg">
						{newPosts.length} new posts
					</div>
				</div>
			{/if}
		</div>
		<h1 class="text-2xl font-semibold">Explore</h1>
		<div class="flex gap-2 items-center">
			<span class="text font-semibold">{$balance} Sats</span>
			<!-- <div on:click={() => console.log('ohoh')}><Icon icon="ph:eye" class="text-2xl" /></div> -->
			<div on:click={() => (profileOpen = true)} class="cursor-pointer">
				<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
			</div>
		</div>
	</div>
</div>
{#if feed.length}
	<div
		class="lg:pt-0 overflow-scroll scrollbar-hide container-height lg:h-screen lg:container-height m-auto !pt-0"
		on:click={() => {
			$posting = false;
			goto('/explore');
		}}
		id="container"
	>
		<button
			class="p-4 bg-primary rounded-full text-white fixed bottom-28 lg:bottom-4 lg:right-1/3 right-4 z-10 border-opacity-0 lg:translate-x-20"
			class:bg-opacity-10={fadein}
			on:click={(e) => {
				e.stopPropagation();
				$posting = true;
			}}
		>
			<Icon icon="teenyicons:add-outline" class="text-2xl" />
		</button>
		<VirtualList
			className="pt-16"
			items={feed}
			bind:start
			bind:end
			bind:viewport
			bind:top
			let:item
			getItemId={(item) => item.data.id}
		>
			<div
				class="block lg:hover:bg-base-200 lg:w-1/3 lg:m-auto py-1 px-1 border-b-2 border-base-200 max-w-full"
			>
				<!-- <RepostHeader note={item} /> -->
				{#if item.parsed.root}
					<Note noteId={item.parsed.root.id} leading />
				{/if}
				<Zap note={item} visible={feed.findIndex((note) => note.id === item.id) >= start - 2} />
				<Header note={item} />
				<div
					class="flex gap-2"
					on:click={(e) => {
						e.stopPropagation();
						goto(`/explore/${item.reply ? item.parsed.reply.id : item.id}`);
					}}
				>
					<div class="min-w-8" />
					<div class="max-w-11/12 -mt-2">
						<Content parsedContent={item.parsed.parsedContent} />
					</div>
				</div>
				<Footer note={item} visible={feed.findIndex((note) => note.id === item.id) >= start - 2} />
			</div>
		</VirtualList>
	</div>
{:else}
	<div
		class="lg:pt-0 overflow-scroll scrollbar-hide container-height lg:container-height lg:w-1/3 m-auto !pt-0"
	>
		{#each Array(8) as _}
			<div class="lg:hover:bg-base-200 rounded-md pt-2 px-1 mb-4 first:pt-16">
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

<slot />
<ProfileModal bind:open={profileOpen} />
<Post bind:open={$posting} />
<Reply />
