<script lang="ts">
	import { page } from '$app/stores';
	import { updateVc } from 'src/lib';
	import { ago, DAY } from 'src/lib/period';
	import { isKind1, type AnyKind, type Kind0Parsed, type Kind1Parsed } from 'src/parsers';
	import Feed from 'src/routes/explore/feed.svelte';
	import { nostrManager, type EventKind } from 'src/wasm/manager';
	import type { NIP02Parsed } from 'src/workers/nip02';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import Note from '../note.svelte';

	// Get pubkey from URL parameter
	const post = $page.params.post;

	let headerItem: ParsedEvent<Kind1Parsed> | undefined;
	let context: ParsedEvent<AnyKind>[] | undefined;
	let loading = true;
	let feedRequests: any[] = [];

	let followList: Writable<NIP02Parsed> = getContext('followList');

	onMount(() => {
		window.scrollTo(0, 0);
		updateVc();
		const sub = nostrManager.subscribe(
			'post_' + post,
			[{ kinds: [1], ids: [post], limit: 1, relays: [], cacheFirst: true }],
			(events: ParsedEvent<AnyKind>[], eventKind: EventKind) => {
				console.log('OK');
				try {
					const [event, ...rest] = events;
					if (!event.parsed) return;
					if (isKind1(event)) {
						loading = false;
						// console.log('note events', note?.id, randomId, events, context);
						headerItem = event;
						context = rest;
						feedRequests = [
							{
								kinds: [1],
								tags: { '#e': post },
								limit: 500,
								since: ago(30 * DAY)
							}
						];
					}
				} catch (e) {
					console.error(e);
				}
			}
		);
		return sub;
	});
</script>

{#if headerItem && feedRequests.length}
	<Feed subscriptionID={'replies_' + post} requests={feedRequests} {headerItem}>
		<div slot="header-content" let:item let:visible>
			<Note note={item} {context} />
		</div>
	</Feed>
{/if}
