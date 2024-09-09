<script lang="ts">
	import { liveQuery } from 'dexie';
	import { type NostrEvent } from 'nostr-tools';
	import { getContact } from 'src/stores/contacts';
	import { db, notes } from 'src/stores/db';
	import { isImageUrl } from 'src/lib';
	import * as linkify from 'linkifyjs';

	import { getLinkPreview } from 'link-preview-js';
	import linkifyHtml from 'linkify-html';
	import VirtualList from '@sveltejs/svelte-virtual-list';
	import Post from './post.svelte';
	import Fullpost from './fullpost.svelte';
	import Icon from '@iconify/svelte';

	$: query = liveQuery<NostrEvent[]>(() =>
		$db.notes
			.orderBy('created_at')
			.filter(
				(note) => !note.tags || !note.tags.some((tag) => Array.isArray(tag) && tag[0] === 'e')
			)
			.reverse()
			.toArray()
	);
	$: feed = $query || [];
	$: console.log(feed);

	let start;
	let end;

	let selected;
</script>

<!-- <div class="px-2 -mt-8"> -->
<VirtualList items={feed} bind:start bind:end let:item>
	<Post note={item} bind:selected />
</VirtualList>
<!-- </div> -->
<Fullpost {selected} />
