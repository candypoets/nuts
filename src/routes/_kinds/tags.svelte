<script lang="ts">
	import {
		type ConnectionStatus,
		type ParsedEvent,
		type RequestObject
	} from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import { getContext } from 'svelte';

	import RelaysList from 'src/components/RelaysList.svelte';
	import { isMobile } from 'src/controller';
	import { limit } from 'src/controller/pagination';
	import Feed from 'src/routes/explore/feed.svelte';
	import Note from 'src/routes/explore/note.svelte';
	import Notifications from '../explore/notifications.svelte';

	export let tags: string[] = [];
	export let visible: boolean;
	export let goBack: () => void;

	let eoce = false;
	let eose = false;

	let headerItem: ParsedEvent | undefined;
	let context: ParsedEvent[] = [];
	let loading = true;
	let feedRequests: RequestObject[] = [];
	let timeout: NodeJS.Timeout | undefined;
	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let imageContext = getContext('imageContext');

	$: feedRequests = [
		{
			kinds: [1],
			tags: { '#t': tags },
			limit: $limit,
			noContext: true,
			noCache: true,
			relays: []
		}
	];
</script>

<Feed
	subscriptionID={'tags_' + tags.reduce((acc, cur) => (acc += cur), '')}
	requests={feedRequests}
	class={imageContext ? 'w-full' : 'w-feed'}
	{headerItem}
	{visible}
	bind:connectionStatus
>
	<svelte:fragment slot="sticky-header">
		<div
			class="px-4 py-3 flex items-center justify-between backdrop-blur bg-base-300 bg-opacity-85 backdrop-blur-md"
		>
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold text-primary">{tags.map((tag) => `#${tag}`).join(' ')}</h1>
			<span />
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		{#if !imageContext}
			<div
				class="w-feed pt-safe border-primary-content h-20 flex items-center justify-between backdrop-blur bg-base-300 bg-opacity-90 rounded-lg px-4"
			>
				<div class="flex gap-2">
					<button
						on:click={goBack}
						class="p-1 rounded-full bg-base-200 bg-opacity-85 backdrop-blur-gpu mr-4"
					>
						<Icon icon="mdi:arrow-left" class="text-xl" />
					</button>
					<h1 class="text-lg font-semibold text-primary">
						{tags.map((tag) => `#${tag}`).join(' ')}
					</h1>
				</div>
				<RelaysList relays={[]} {connectionStatus} mini={$isMobile} />
				<!-- <span class="w-10" /> -->
			</div>
		{/if}

		{#if headerItem}
			<Note note={headerItem} {context} {visible} zaps main />
		{/if}
	</svelte:fragment>
	<!-- <svelte.fragment slot="sticky-footer">
		<div class="md:pb-6 pb-safe md:px-6 px-2">
			<div
				on:click|stopPropagation={(_) => go('reply:' + headerItem.id()?.toString())}
				class="px-4 py-2 rounded-full backdrop-blur-2xl border border-accent"
			>
				Reply to
				{#if headerItem}
					<User pubkey={headerItem.pubkey()?.toString()} {context} />
				{/if}
			</div>
		</div>
	</svelte.fragment> -->
	<!-- <svelte.fragment slot="sticky-footer">
		<div class="md:pb-4 pb-safe pt-0 backdrop-blur-md">
			{#if headerItem}
				<Reply parent={headerItem} {context} actionsOnTop />
			{/if}
		</div>
	</svelte.fragment> -->
</Feed>
