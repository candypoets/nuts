<script lang="ts">
	import { liveQuery } from 'dexie';
	import { type NostrEvent } from 'nostr-tools';
	import { getContact } from 'src/stores/contacts';
	import { contactsCache, db, notes } from 'src/stores/db';
	import { isImageUrl } from 'src/lib';
	import * as linkify from 'linkifyjs';

	import { getLinkPreview } from 'link-preview-js';
	import linkifyHtml from 'linkify-html';
	// import VirtualList from '@sveltejs/svelte-virtual-list';
	import VirtualList from 'src/comp/VirtualList.svelte';
	import Post from './post.svelte';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';

	import Fullpost from './fullpost.svelte';
	import Icon from '@iconify/svelte';
	import { selectedPost } from 'src/stores';
	import { onMount } from 'svelte';

	$: query = liveQuery<NostrEvent[]>(() =>
		$db.notes
			.orderBy('created_at')
			.filter(
				(note) => !note.tags || !note.tags.some((tag) => Array.isArray(tag) && tag[0] === 'e')
			)
			.filter((note) => !!$contactsCache.get(note.pubkey))
			.reverse()
			.toArray()
	);
	$: feed = $query || [];
	$: console.log(feed);

	let start;
	let end;
	let top: number = 0;

	let oldTop = 0;

	let topper: HTMLElement;
	let footer: HTMLElement;

	onMount(() => {
		topper = document.getElementById('top');
		footer = document.getElementById('footer');
	});
	$: {
		console.log(topper, footer);
		top > oldTop;

		if (top > oldTop + 25) {
			topper?.classList.add('toggle-up');
			footer?.classList.add('blur-in');
			oldTop = top;
			// prevScrollPos = currentScrollPos;
		} else if (top < oldTop - 25) {
			topper?.classList.remove('toggle-up');
			footer?.classList.remove('blur-in');
			oldTop = top;
			// prevScrollPos = currentScrollPos;
		} else if (top == 0) {
			topper?.classList.remove('toggle-up');
			footer?.classList.remove('blur-in');
			oldTop = top;
			// prevScrollPos = currentScrollPos;
		}
	}

	let selected;
</script>

<!-- <div class="px-2 -mt-8"> -->
<!-- <br />
<br />
<br /> -->
<VirtualList items={feed} bind:start bind:end bind:top let:item>
	<div class="">
		<Header note={item} />
		<div class="flex gap-2" on:click={() => ($selectedPost = item)}>
			<div class="min-w-8" />
			<div class="text-sm break-words overflow-hidden">
				<!-- {content?.slice(0, 500)}{content?.length > 500 ? '...' : ''} -->
				<Content content={item.content} />
			</div>
		</div>
		<!-- <Content content={item.content} /> -->
		<Footer note={item} />
		<br />
	</div>
	<!-- <Post note={item} /> -->
</VirtualList>
<!-- </div> -->
<Fullpost />
