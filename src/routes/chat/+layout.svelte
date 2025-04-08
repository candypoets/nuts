<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { NostrEvent } from 'nostr-tools';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import { db, key } from 'src/stores/db';
	import { spring } from 'svelte/motion';
	import PictureProfile from '../explore/post/picture-profile.svelte';
	import User from '../explore/user.svelte';

	let profileOpen: boolean = false;

	let messages: NostrEvent[] = [];

	let contacts: { [key: string]: NostrEvent } = {};
	// find all the different authors in the dms collection
	$db.dms
		.orderBy('created_at')
		.toArray()
		.then((dms) => {
			dms.forEach((dm) => {
				const sender = dm.tags.find((tag) => tag[0] === 'p')?.[1];
				if (dm.pubkey == $key?.pub && sender == $key?.pub) return;
				contacts[dm.pubkey] = dm;
				if (sender) {
					contacts[sender] = dm;
				}
			});
		});

	$: filteredContacts = Object.keys(contacts)
		.sort((a, b) => contacts[b].created_at - contacts[a].created_at)
		.filter((c) => c != $key.pub);

	$: console.log(messages, Object.keys(contacts));

	const translateX = spring(0);

	$: {
		if ($page.params.pubkey) {
			$translateX = -500;
		} else {
			$translateX = 0;
		}
	}
</script>

<div class="px-4 lg:px-0 lg:w-full w-full m-auto p-2 lg:mt-0 bg-basic z-10" id="top">
	<div class="flex justify-between items-start lg:w-1/3 lg:m-auto lg:relative">
		<h1 class="text-2xl font-semibold">Chat</h1>
	</div>
</div>
<div
	class="lg:h-auto lg:pt-0 overflow-scroll scrollbar-hide h-screen px-2"
	on:click={() => goto('/chat')}
>
	<div class="lg:w-1/4 lg:m-50 transition-all" class:lg:m-25={$page.params.pubkey}>
		{#each filteredContacts as contact}
			<a
				href={'/chat/' + contact}
				class="flex mb-4 gap-2 overflow-x-hidden w-full hover:bg-base-200 py-2 px-4 cursor-pointer"
			>
				<div class="w-10 flex-shrink-0">
					<PictureProfile pubkey={contact} className="!w-10 !h-10" />
				</div>
				<div class="flex-grow-0 max-w-full">
					<div class="flex justify-between">
						<User npub={contact} link={false} />
						{new Date(contacts[contact].created_at * 1000).toLocaleDateString()}
					</div>
					<div class="text-xs break-words max-h-12 overflow-hidden">
						<span>
							{#if contacts[contact].pubkey == $key.pub}vous:
							{/if}
							{contacts[contact].content}
						</span>
					</div>
				</div>
			</a>
		{/each}
	</div>
</div>

<slot />

<ProfileModal bind:open={profileOpen} />

<style>
	.max-w-full {
		width: calc(100% - 3rem);
	}
	@media (min-width: 1024px) {
		.lg\:m-25 {
			margin-left: 25% !important;
		}
		.lg\:m-50 {
			margin-left: 37.5%;
		}
	}
</style>
