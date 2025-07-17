<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import _ from 'lodash';
	import { nostrManager, useSubscription, type SubscribeKind } from 'src/model/nostr-main';
	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/types';
	import type { ParsedEvent } from 'src/types';
	import { onMount } from 'svelte';
	import { userQuery } from '../queries/user';

	export let pubkey: string;
	export let link: boolean = true;
	export let relays: string[] = [];
	export let context: ParsedEvent<AnyKind>[] = [];
	export let query = true;

	let user: Kind0Parsed | undefined;
	let sub: (() => void) | undefined;

	onMount(() => {
		user = (context || []).find((event) => event.kind === 0 && event.pubkey === pubkey)?.parsed as
			| Kind0Parsed
			| undefined;
		if (!user && query) {
			sub = useSubscription(
				'u_' + pubkey,
				userQuery(pubkey),
				(events: ParsedEvent<AnyKind>[], type: SubscribeKind) => {
					if (type == 'EOSE') {
						return;
					}
					const [event, ...context] = events;
					if (isKind0(event)) {
						user = event.parsed as Kind0Parsed;

						sub?.();
						sub = undefined;
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
