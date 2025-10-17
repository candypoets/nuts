<script lang="ts">
	import {
		type ConnectionStatus,
		Contact,
		Kind10002Parsed,
		Kind3Parsed,
		ParsedData,
		type ParsedEvent,
		type RequestObject,
		WorkerMessage
	} from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { follows, kind0 } from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import { now } from 'src/lib/period';
	import { proxyAvatarUrl, proxyBannerUrl } from 'src/lib/proxy';
	import Feed from 'src/routes/explore/feed.svelte';

	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind0,
		asKind10002,
		asKind3,
		asParsedEvent,
		fbArray
	} from '@candypoets/nipworker/utils';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { onDestroy, onMount } from 'svelte';
	import Avatar from '../explore/avatar.svelte';
	import { go } from '../modals/modal';
	import { userQuery } from '../queries/user';
	import { parseContent, type ContentBlock } from 'src/lib';
	import About from 'src/components/About.svelte';
	import { normalizeURL } from 'nostr-tools/utils';

	// Get pubkey from URL parameter
	export let pubkey: string;
	export let visible: boolean;
	export let goBack: () => void;

	let headerItem: ParsedEvent | undefined;
	let parsedAbout: ContentBlock[] | undefined;
	let writeRelays: string[] = [];
	let readRelays: string[] = [];
	let feedProfileRequests: RequestObject[] = [];
	let feedFollowRequests: RequestObject[] = [];
	let contacts: Contact[] = [];
	let timeout: NodeJS.Timeout | undefined;
	let mode = 'profile';

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let sub: (() => void) | undefined;
	let contactSub: (() => void) | undefined;

	function handleEvents(message: WorkerMessage) {
		const parsedEvent = asParsedEvent(message);
		if (parsedEvent) {
			switch (parsedEvent.parsedType()) {
				case ParsedData.Kind0Parsed:
					const kind0 = asKind0(parsedEvent);
					headerItem = parsedEvent;
					parseContent(kind0?.about()?.toString() || '').then((result) => (parsedAbout = result));
					break;
				case ParsedData.Kind10002Parsed:
					console.log('10002');
					writeRelays = fbArray(asKind10002(parsedEvent) as Kind10002Parsed, 'relays')
						?.filter((r) => r.write())
						.map((r) => r.url()?.toString())
						.filter(Boolean) as string[];
					readRelays = fbArray(asKind10002(parsedEvent) as Kind10002Parsed, 'relays')
						?.filter((r) => r.read())
						.map((r) => r.url()?.toString())
						.filter(Boolean) as string[];
					if (!contacts.length) {
						contactSub = useSubscription(
							'c_' + pubkey,
							[{ kinds: [3], authors: [pubkey], limit: 30, relays: writeRelays }],
							handleEvents,
							{}
						);
					} else {
						feedFollowRequests = [
							{
								kinds: [1],
								authors: contacts.map((c) => c.pubkey()?.toString()) as string[],
								limit: $limit,
								noContext: true,
								relays: readRelays
							}
						];
					}
					feedProfileRequests = [
						{
							kinds: [1],
							authors: [pubkey],
							limit: $limit,
							noContext: true,
							relays: writeRelays
						}
					];

					break;
				case ParsedData.Kind3Parsed:
					contacts = fbArray(asKind3(parsedEvent) as Kind3Parsed, 'contacts');
					if (readRelays) {
						feedFollowRequests = [
							{
								kinds: [1],
								authors: contacts.map((c) => c.pubkey()?.toString()) as string[],
								limit: $limit,
								noContext: true,
								relays: readRelays
							}
						];
					}
					break;
			}
		}
	}

	onDestroy(unsubscribe);

	function subscribe() {
		timeout = setTimeout(() => {
			if (visible && !sub) {
				sub = useSubscription('u_' + pubkey, userQuery(pubkey), handleEvents, {});
			}
		});
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			sub?.();
			sub = undefined;
		}
	}

	function updateFollowList() {
		if (!$kind0) return;

		if ($follows.length == 0) return console.error('empty follow list');

		const template = {
			kind: 3,
			created_at: now(),
			tags: _.uniqBy(
				[
					...$follows.map((c) => ['p', c.pubkey, c.relay || '']),
					['p', pubkey, writeRelays?.[0] || '']
				],
				(c) => c[1]
			).filter((c) => ($follows.some((c) => c.pubkey === pubkey) ? c[1] !== pubkey : true)),
			content: ''
		};

		usePublish('follow_' + pubkey, template);
	}

	onMount(() => {
		// set a time out after which we set the feedRequests whatever happen
		setTimeout(() => {
			if (!feedProfileRequests.length) {
				feedProfileRequests = [
					{
						kinds: [1],
						authors: [pubkey],
						limit: $limit,
						noContext: true,
						relays: writeRelays
					}
				];
			}
		}, 1000);
	});

	$: visible ? subscribe() : unsubscribe();
</script>

<Feed
	subscriptionID={mode == 'profile' ? 'kind0P_' + pubkey : 'kind0F_' + pubkey}
	requests={mode == 'profile' ? feedProfileRequests : feedFollowRequests}
	{visible}
	bind:connectionStatus
>
	<svelte:fragment slot="sticky-header">
		<div class="px-4 py-3 flex items-center justify-between backdrop-blur-md pt-safe">
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<!-- <h1 class="text-lg font-semibold">Profile</h1> -->
			<Avatar {pubkey} size="lg" />
			<span class="w-8" />
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		<!-- {#if item.id != headerItem.id} -->
		{@const p = asKind0(headerItem)}
		{@const banner = p?.banner()?.toString()}
		{@const name = p?.name()?.toString()}
		{@const nip05 = p?.nip05()?.toString()}
		{@const picture = p?.picture()?.toString()}
		{@const about = p?.about()?.toString()}
		<div
			class="transition-all duration-300 w-feed mx-auto will-change-transform bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg"
			class:relative={visible}
			class:shadow-md={!visible}
			class:z-20={!visible}
			class:top-0={!visible}
			class:left-0={!visible}
			class:right-0={!visible}
		>
			<!-- Banner image (only shown when header is visible) -->
			{#if banner}
				<div class="w-full banner-container rounded-lg">
					<!-- Banner image -->

					<div
						class="absolute w-full h-52 bg-cover bg-center top-0 left-0 right-0"
						style="background-image: url('{banner ? proxyBannerUrl(banner) : ''}');"
					>
						<div class="w-feed h-16 flex items-center justify-between shadow-sm pt-safe">
							<button on:click={goBack} class="p-1 z-10 btn btn-sm btn-circle ml-4">
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
					class="w-feed border-b border-base-200 h-52 flex items-start justify-between shadow-sm pt-safe"
				>
					<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
						<Icon icon="mdi:arrow-left" class="text-xl" />
					</button>
					<!-- <h1 class="text-lg font-semibold">Profile</h1> -->
					<span class="w-10" />
				</div>
			{/if}
			<!-- Content adjusts size/layout based on visible state -->
			<div class="px-4 my-6">
				<div class="flex items-center gap-3 mb-4">
					<div class="absolute right-4 top-20">
						<button
							class="z-10 btn lg:btn-wide w-32 border border-white btn-nav lg:text-xl bg-opacity-80"
							on:click={updateFollowList}
						>
							{#if $follows.some((f) => f.pubkey === pubkey)}
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
						src={picture ? proxyAvatarUrl(picture) : '/miss-profile.png'}
						alt={name || 'Profile'}
						class="w-32 h-32 -mt-60 rounded-full border absolute object-cover"
					/>
					<div>
						<h2 class="text-xl font-bold">{name || 'Unnamed'}</h2>
						<!-- {#if visible} -->
						<p class="text-primary">@{nip05 || pubkey.substring(0, 8)}</p>
						<!-- {/if} -->
					</div>
				</div>

				{#if about}
					<p class="mb-4 opacity-1"><About content={parsedAbout || []} /></p>
				{/if}
				<RelaysList
					relays={(mode == 'profile' ? writeRelays : readRelays).map(normalizeURL)}
					{connectionStatus}
				/>
			</div>

			<div class="tabs">
				<a
					class="tab"
					class:border-t={mode == 'profile'}
					class:border-primary-content={mode == 'profile'}
					on:click={(_) => (mode = 'profile')}>Posts</a
				>
				<a
					class="tab"
					class:tab-disabled={!contacts.length}
					class:border-t={mode == 'follows'}
					class:border-primary-content={mode == 'follows'}
					on:click={(_) => (mode = 'follows')}>Feed</a
				>
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
