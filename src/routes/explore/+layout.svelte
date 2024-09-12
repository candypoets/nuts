<script lang="ts">
	import Icon from '@iconify/svelte';
	import { liveQuery } from 'dexie';
	import { type NostrEvent } from 'nostr-tools';
	import { updateVc } from 'src/lib';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import VirtualList from 'src/comp/VirtualList.svelte';
	import { contactsCache, db, notesCache } from 'src/stores/db';
	import { notesSub, reactionSub, zapSub } from 'src/stores/notes';
	import { profile } from 'src/stores/profile';
	import { balance } from 'src/stores/wallet';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';
	import ReplyHeader from './post/reply-header.svelte';
	import { onMount } from 'svelte';
	import { posting, selectedPost } from 'src/stores';
	import Post from './post.svelte';

	$: query = liveQuery<NostrEvent[]>(() =>
		$db.notes
			.orderBy('created_at')
			.filter((note) => {
				if (note.reply_to) {
					return !!note.reply_to_pubkey;
				}
				return true;
			})
			.filter((note) => !!$contactsCache.get(note.pubkey))
			.reverse()
			.toArray()
	);
	$: feed = $query || [];

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
		const notes = notesSub.subscribe((n) => n);
		// const reactions = reactionSub.subscribe((r) => r);
		// const zaps = zapSub.subscribe((z) => z);
		return () => {
			notes();
			// reactions();
			// zaps();
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
	class="px-4 lg:px-0 lg:w-1/3 w-full m-auto p-2 lg:mt-0 lg:relative fixed bg-basic z-10"
	on:click={() => viewport.scrollTo({ top: 0, behavior: 'smooth' })}
	id="top"
>
	<div class="flex justify-between items-start">
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
		class="lg:pt-0 overflow-scroll scrollbar-hide container-height lg:container-height lg:w-1/3 m-auto !pt-0"
		id="container"
	>
		<button
			class="btn btn-primary btn-circle fixed bottom-24 right-4 z-10 border-opacity-0"
			class:bg-opacity-10={fadein}
			on:click={() => ($posting = true)}
		>
			<Icon icon="teenyicons:add-outline" class="text-2xl" />
		</button>
		<VirtualList items={feed} bind:start bind:end bind:viewport bind:top let:item>
			<!-- {(() => {
				console.log(
					'Logging from template:',
					start,
					feed.findIndex((note) => note.id === item.id),
					end,
					feed.findIndex((note) => note.id === item.id) >= start
				);
				return '';
			})()} -->
			<div class="lg:hover:bg-base-200 rounded-md pt-2 px-1">
				<ReplyHeader note={item} />
				<Header note={item} />
				<div
					class="flex gap-2"
					on:click={() => {
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
						<!-- {content?.slice(0, 500)}{content?.length > 500 ? '...' : ''} -->
						<Content content={item.content} />
					</div>
				</div>
				<!-- <Content content={item.content} /> -->
				<Footer note={item} visible={feed.findIndex((note) => note.id === item.id) >= start} />

				<br />
			</div>
			<!-- <Post note={item} /> -->
		</VirtualList>
	</div>
{:else}
	<div
		class="lg:pt-0 overflow-scroll scrollbar-hide container-height lg:container-height lg:w-1/3 m-auto !pt-0"
	>
		{#each Array(5) as _}
			<div class="lg:hover:bg-base-200 rounded-md pt-2 px-1 mb-4 first:pt-16">
				<div class="flex items-center mb-2">
					<div class="w-10 h-10 rounded-full bg-gray-300 shimmer"></div>
					<div class="ml-2 flex-grow">
						<div class="h-4 bg-gray-300 rounded w-1/4 shimmer"></div>
						<div class="h-3 bg-gray-300 rounded w-1/3 mt-1 shimmer"></div>
					</div>
				</div>
				<div class="h-16 bg-gray-300 rounded shimmer"></div>
				<div class="flex justify-between mt-2">
					<div class="h-4 bg-gray-300 rounded w-1/6 shimmer"></div>
					<div class="h-4 bg-gray-300 rounded w-1/6 shimmer"></div>
					<div class="h-4 bg-gray-300 rounded w-1/6 shimmer"></div>
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
		background: linear-gradient(to right, #f6f7f8 8%, #edeef1 18%, #f6f7f8 33%);
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
