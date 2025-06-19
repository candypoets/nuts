<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { kind0, kind3 } from 'src/controller/nostr';
	import { now } from 'src/lib/period';
	import { nostrManager, type Request, type SubscribeKind } from 'src/model/nostr';
	import Feed from 'src/routes/explore/feed.svelte';
	import type { ParsedEvent } from 'src/types';
	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/types';
	import { onDestroy } from 'svelte';
	import { go } from '../modals/modal';

	// Get pubkey from URL parameter
	export let pubkey: string;
	export let visible: boolean;

	let loading = true;
	let headerItem: ParsedEvent<Kind0Parsed> | undefined;
	let feedRequests: Request[] = [
		{
			kinds: [1],
			authors: [pubkey],
			limit: 100,
			relays: []
		}
	];
	let timeout: NodeJS.Timeout | undefined;

	let sub: () => void;

	function handleEvents(events: ParsedEvent<AnyKind>[], kind: SubscribeKind) {
		if (kind == 'EOSE') {
			return;
		}
		const [event] = events;
		if (!event?.parsed) return;
		if (isKind0(event)) {
			loading = false;
			headerItem = event;
		}
	}

	function goBack() {
		// Get current path
		const currentPath = $page.url.pathname;

		// Find the last "/" and get everything before it
		const lastSlashIndex = currentPath.lastIndexOf('/');
		console.log(currentPath, lastSlashIndex);

		if (lastSlashIndex > 0) {
			// Navigate to the parent path (everything before last slash)
			const parentPath = currentPath.substring(0, lastSlashIndex);
			goto(parentPath);
		} else {
			// If no slash or at root, go to explore page
			goto('/explore');
		}
	}

	onDestroy(unsubscribe);

	function subscribe() {
		timeout = setTimeout(() => {
			if (visible) {
				// feedRequests = [];
				sub = nostrManager.subscribe(
					'kind0_' + pubkey,
					[
						{
							kinds: [0],
							authors: [pubkey],
							limit: 1,
							relays: [],
							cacheFirst: true
						},
						{
							kinds: [10002],
							authors: [pubkey],
							limit: 1,
							relays: [],
							cacheFirst: true
						}
					],
					handleEvents
				);
			}
		});
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			sub?.();
		}
	}

	function updateFollowList() {
		if (!$kind0) return;
		if ($kind3?.parsed?.length == 0) return console.error('empty follow list');

		const template = {
			kind: 3,
			created_at: now(),
			tags: _.uniqBy(
				[
					...($kind3?.parsed || []).map((c) => ['p', c.pubkey, c.relays?.[0] || '']),
					['p', pubkey, headerItem?.parsed?.relays?.[0] || '']
				],
				(c) => c[1]
			).filter((c) =>
				($kind3?.parsed || []).some((c) => c.pubkey === pubkey) ? c[1] !== pubkey : true
			),
			content: ''
		};

		nostrManager.publish('follow_' + pubkey, template);
	}

	$: visible ? subscribe() : unsubscribe();
</script>

<Feed subscriptionID={'kind0_feed_' + pubkey} requests={feedRequests} {visible}>
	<svelte:fragment slot="sticky-header">
		<div class="px-4 py-3 flex items-center justify-between backdrop-blur-md safe-padding-top">
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold">Profile</h1>
			<span class="w-8" />
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		<!-- {#if item.id != headerItem.id} -->
		{@const p = headerItem?.parsed}
		<div
			class="transition-all duration-300 w-feed mx-auto will-change-transform unsafe-padding-top"
			class:relative={visible}
			class:shadow-md={!visible}
			class:z-20={!visible}
			class:top-0={!visible}
			class:left-0={!visible}
			class:right-0={!visible}
		>
			<!-- Banner image (only shown when header is visible) -->
			{#if p?.banner}
				<div class="w-full banner-container rounded-2xl">
					<!-- Banner image -->

					<div
						class="absolute w-full h-52 bg-cover bg-center top-0 left-0 right-0"
						style="background-image: url('{p?.banner}');"
					>
						<div class="w-feed h-16 flex items-center justify-between shadow-sm safe-padding-top">
							<button on:click={goBack} class="p-1 z-10 rounded-full hover:bg-base-200 mr-4">
								<Icon icon="mdi:arrow-left" class="text-xl" />
							</button>
						</div>
					</div>

					<!-- Gradient overlay that fades out the banner towards the bottom -->
					<div class="absolute top-0 left-0 right-0 bottom-0 banner-fade-overlay"></div>

					<!-- Placeholder to maintain height -->
					<div class="h-52 w-full"></div>
				</div>
			{:else}
				<div
					class="w-feed border-b border-base-200 h-16 flex items-center justify-between shadow-sm safe-padding-top"
				>
					<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
						<Icon icon="mdi:arrow-left" class="text-xl" />
					</button>
					<h1 class="text-lg font-semibold">Profile</h1>
					<span class="w-10" />
				</div>
			{/if}
			<!-- Content adjusts size/layout based on visible state -->
			<div class="px-4 my-6">
				<div class="flex items-center gap-3 mb-4">
					<div class="absolute right-4 top-20" class:top-4={!p?.banner}>
						<button
							class="z-10 btn lg:btn-wide w-32 border border-white btn-nav lg:text-xl bg-opacity-80"
							on:click={updateFollowList}
						>
							{#if $kind3?.parsed?.some((f) => f.pubkey === pubkey)}
								<Icon icon="mdi:account-check" />
								Unfollow
							{:else}
								<Icon icon="mdi:account-plus" />
								Follow
							{/if}</button
						>
						<br />

						<button
							class="z-10 btn lg:btn-wide w-32 border border-white btn-nav lg:text-xl bg-opacity-80 mt-4"
							on:click={() => go('ecash:' + pubkey)}
						>
							<Icon icon="ion:flash" />
							Zap
						</button>
					</div>
					<img
						src={p?.picture || '/ns-naked.svg'}
						alt={p?.name || 'Profile'}
						class:-mt-60={p?.banner}
						class:!relative={!p?.banner}
						class="w-32 h-32 rounded-full border absolute object-cover"
					/>
					<div>
						<h2 class="text-xl font-bold">{p?.name || 'Unnamed'}</h2>
						<!-- {#if visible} -->
						<p class="text-primary">@{p?.nip05 || pubkey.substring(0, 8)}</p>
						<!-- {/if} -->
					</div>
				</div>

				{#if p?.about}
					<p class="mb-4 opacity-1">{@html p?.about}</p>
				{/if}
			</div>

			<div class="tabs tabs-bordered">
				<a class="tab tab-active">Posts</a>
				<a class="tab">Follows</a>
			</div>
			<!-- <h3 class="text-lg font-medium mb-4 px-4">Posts</h3> -->
		</div>
		<!-- {/if} -->
	</svelte:fragment>
</Feed>

<style>
	.banner-container {
		position: relative;
		overflow: hidden;
	}

	.banner-content {
		position: relative;
		/* z-index: 0; */
		margin-top: -20px; /* Pull content slightly up into the faded part of banner */
	}
</style>
