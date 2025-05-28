<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import _ from 'lodash';
	import { nostrManager, type SubscribeKind } from 'src/model/nostr';
	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/types';
	import type { ParsedEvent } from 'src/types';
	import { onMount } from 'svelte';

	export let pubkey: string;
	export let link: boolean = true;
	export let relays: string[] = [];
	export let context: ParsedEvent<AnyKind>[] = [];
	export let query = true;

	let user: Kind0Parsed | undefined;
	let sub: () => void;

	$: {
		if (!user && pubkey) {
		}
	}

	$: {
		if (user && !!sub) sub();
	}

	onMount(() => {
		user = (context || []).find((event) => event.kind === 0 && event.pubkey === pubkey)?.parsed as
			| Kind0Parsed
			| undefined;
		if (!user && query) {
			sub = nostrManager.subscribe(
				'user_' + pubkey + '_' + _.random(10000),
				[{ kinds: [0], authors: [pubkey], limit: 1, cacheFirst: true, closeOnEOSE: true, relays }],
				(events: ParsedEvent<AnyKind>[], type: SubscribeKind) => {
					if (type == 'EOSE') {
						return;
					}
					const [event, ...context] = events;
					if (isKind0(event)) {
						user = event.parsed as Kind0Parsed;
						sub();
					}
				}
			);
		}
		return () => sub?.();
	});

	function go() {
		const currentPath = $page.url.pathname;
		const profilePath = `nprofile:${pubkey}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(profilePath)) {
			goto(`${currentPath}/${profilePath}`);
		}
	}
</script>

{#if link}
	<a
		class="text-accent whitespace-nowrap hover:underline"
		on:click|stopPropagation|preventDefault={go}
		>@{user?.name?.trim() || pubkey?.slice(0, 15) + '...'}</a
	>
{:else}
	<span>{user?.name?.trim() || pubkey?.slice(0, 15) + '...'}</span>
{/if}
