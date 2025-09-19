<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import _ from 'lodash';
	import { onMount } from 'svelte';

	import { userQuery } from 'src/routes/queries/user';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import type { ParsedEvent, Kind0Parsed, WorkerMessage } from '@candypoets/nipworker';
	import { asKind0, isKind0 } from '@candypoets/nipworker/utils';
	import { profileManager } from 'src/controller/managers';

	export let pubkey: string;
	export let link: boolean = true;
	export let relays: string[] = [];
	export let context: ParsedEvent[] = [];
	export let query = true;

	let user: Kind0Parsed | undefined;
	let sub: (() => void) | undefined;

	let queried = false;

	onMount(() => {
		user = context.find((c) => asKind0(c)?.pubkey()?.toString() == pubkey) as
			| Kind0Parsed
			| undefined;
		if (!user && query) {
			queried = true;
			sub = useSubscription(
				'u_' + pubkey,
				userQuery(pubkey),
				(message: WorkerMessage) => {
					const kind0 = isKind0(message);
					if (kind0 && kind0.pubkey()?.toString() === pubkey) {
						user = kind0;
						sub?.();
					}
				},
				{},
				profileManager
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
		class:text-red-500={!queried}
		on:click|stopPropagation|preventDefault={go}
		>@{user?.name?.()?.toString()?.trim() ||
			user?.displayName?.()?.toString()?.trim() ||
			pubkey?.slice(0, 15) + '...'}</a
	>
{:else}
	<span
		>{user?.name?.()?.toString()?.trim() ||
			user?.displayName?.()?.toString()?.trim() ||
			pubkey?.slice(0, 15) + '...'}</span
	>
{/if}
