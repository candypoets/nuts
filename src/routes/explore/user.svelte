<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/parsers';
	import { nostrManager, type EventKind } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onDestroy } from 'svelte';

	export let pubkey: string;
	export let link: boolean = true;
	export let relays: string[] = [];
	export let context: ParsedEvent<AnyKind>[];
	export let query = true;

	let user: Kind0Parsed | undefined;
	let sub: () => void;

	$: {
		if (!user && pubkey) {
			user = (context || []).find((event) => event.kind === 0 && event.pubkey === pubkey)
				?.parsed as Kind0Parsed | undefined;
			if (!user && query) {
				sub = nostrManager.subscribe(
					'user_' + pubkey,
					[{ kinds: [0], authors: [pubkey], limit: 1, cacheFirst: true, relays }],
					(events: ParsedEvent<AnyKind>[], type: EventKind) => {
						const [event, ...context] = events;
						if (isKind0(event)) {
							user = event.parsed as Kind0Parsed;
						}
					}
				);
			}
		}
	}

	onDestroy(() => {
		if (sub) {
			sub();
		}
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
		class="text-violet-700 whitespace-nowrap hover:underline"
		on:click|stopPropagation|preventDefault={go}
		>@{user?.name?.trim() || pubkey?.slice(0, 15) + '...'}</a
	>
{:else}
	<span>{user?.name?.trim() || pubkey?.slice(0, 15) + '...'}</span>
{/if}
