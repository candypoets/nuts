<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { liveQuery } from 'dexie';
	import { type NostrEvent } from 'nostr-tools';
	import { updateVc } from 'src/lib';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import VirtualList from 'src/comp/VirtualList.svelte';
	import { contacts, contactsCache, db, notesCache, type Note } from 'src/stores/db';
	import { fetchThread, zapSub } from 'src/stores/notes';
	import { profile } from 'src/stores/profile';
	import { balance } from 'src/stores/wallet';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';
	import ReplyHeader from './post/reply-header.svelte';
	import { onMount } from 'svelte';
	import { posting, selectedPost } from 'src/stores';
	import Post from './post.svelte';
	import RepostHeader from './post/repost-header.svelte';
	import { pool } from 'src/stores/relays';
	import { fly } from 'svelte/transition';

	let feed: Note[] = [];
	let newPosts: Note[] = [];

	let start = 0;
	let end = 0;

	let viewport: HTMLElement;

	let profileOpen: boolean = false;

	let top: number = 0;

	let oldTop = 0;

	let topper: HTMLElement;
	let footer: HTMLElement;

	onMount(() => {
		topper = document.getElementById('top');
		footer = document.getElementById('footer');
		updateVc();
		const abortController = new AbortController();
		$db.notes
			.orderBy('created_at')
			.filter((note) => {
				if (note.reply_to) {
					return !!note.reply_to_pubkey;
				}
				return true;
			})
			.filter((note) => !!$contactsCache.get(note.pubkey) || !!note?.reposted_by)
			.reverse()
			.toArray()
			.then(async (res) => {
				feed = res;
				const newMessages = fetchThread($pool, $contacts, abortController, res[0]?.created_at);
				let loaded = false;
				for await (const message of newMessages) {
					if (!loaded) {
						feed = _.uniqBy([...message, ...feed], 'id');
					} else {
						newPosts = _.uniqBy([...message, ...newPosts], 'id');
					}
					loaded = true;
				}
			});
		return () => {
			abortController.abort();
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
	// $: console.log(start, end, top);
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
		on:click={() => ($selectedPost = null)}
		id="container"
	>
		<button
			class="btn btn-primary btn-circle fixed bottom-24 right-4 z-10 border-opacity-0"
			class:bg-opacity-10={fadein}
			on:click={() => ($posting = true)}
		>
			<Icon icon="teenyicons:add-outline" class="text-2xl" />
		</button>
		<VirtualList className="pt-16" items={feed} bind:start bind:end bind:viewport bind:top let:item>
			<div
				class="lg:hover:bg-base-200 lg:w-1/3 lg:m-auto py-2 px-1 border-b-2 border-base-200 lg:border-none"
			>
				<RepostHeader note={item} />
				<ReplyHeader note={item} />
				<Header note={item} />
				<div
					class="flex gap-2"
					on:click={(e) => {
						e.stopPropagation();
						console.log('clicked', item);
						if (item.reply_to) {
							$selectedPost = $notesCache.get(item.reply_to);
						} else {
							$selectedPost = item;
						}
					}}
				>
					<div class="min-w-8" />
					<div class="text-sm break-words overflow-hidden">
						<Content content={item.content} />
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

<style>
	.shimmer {
		background: linear-gradient(
			to right,
			rgba(246, 247, 248, 0.8) 8%,
			rgba(237, 238, 241, 0.8) 18%,
			rgba(246, 247, 248, 0.8) 33%
		);
		background-size: 1000px 100%;
		animation: shimmer 2s infinite linear;
	}

	@keyframes shimmer {
		0% {
			background-position: -1000px 0;
		}
		100% {
			background-position: 1000px 0;
		}
	}
</style>
