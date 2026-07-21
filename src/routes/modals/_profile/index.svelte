<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from 'src/lib/paths';
	import Icon from '@iconify/svelte';

	import { getManager, type ParsedEvent, type WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind0 } from '@candypoets/nipworker/utils';
	import { isParsedEvent } from '@candypoets/nipworker/utils';
	import { key } from 'src/controller';
	import { kind0 } from 'src/controller/nostr';
	import {
		fetchAdminRelayInfo,
		relayRoleFromSet,
		relaySetAddressesFromRelayFeedEvent,
		relayUrlsFromRelaySet,
		type RelayInfo
	} from 'src/lib/adminRelays';
	import { DEFAULT_RELAYS, INDEXER_RELAYS } from 'src/lib/env';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import { go } from 'src/routes/modals/modal';
	import { communityDirectoryQuery, communityRoleSetsQuery } from 'src/routes/queries/communities';
	import { getContext, onDestroy, onMount } from 'svelte';

	let animator: { goBack: () => void } = getContext('animator');
	let search: string;
	let adminRelaySets: ParsedEvent[] = [];
	let adminRelays: RelayInfo[] = [];
	let adminRelaysLoading = false;
	let relayFeedReady = false;
	let unsubscribeRelayFeed: (() => void) | undefined;
	let unsubscribeRelaySets: (() => void) | undefined;

	const manager = getManager();

	$: k0 = asKind0($kind0 as ParsedEvent);
	// export let encodedToken: string = '';
	//
	//

	$: accounts = Object.keys(manager.getAccounts()).sort((a, b) =>
		$key?.pub === a ? -1 : $key?.pub === b ? 1 : a.localeCompare(b)
	);

	function loadAdminRelayInfos() {
		const pubkey = $key?.pub;
		if (!pubkey) return;

		const urls = Array.from(
			new Set(
				adminRelaySets
					.filter((event) => relayRoleFromSet(event) === 'admin')
					.flatMap((event) => relayUrlsFromRelaySet(event))
			)
		);
		adminRelays = urls.map((url) => ({ url, isAdmin: false }));
		if (!urls.length) {
			adminRelaysLoading = false;
			return;
		}

		adminRelaysLoading = true;
		Promise.all(urls.map((url) => fetchAdminRelayInfo(url, pubkey))).then((infos) => {
			adminRelays = infos.filter((info) => info.isAdmin);
			adminRelaysLoading = false;
		});
	}

	function openCommunityDashboard(url: string) {
		void goto(resolve(`/admin/${encodeURIComponent(url)}`));
	}

	function subscribeAdminRelaySets(addresses: string[]) {
		const pubkey = $key?.pub;
		if (!pubkey) return;
		unsubscribeRelaySets?.();
		adminRelaySets = [];
		adminRelays = [];

		const relays = Array.from(
			new Set([...INDEXER_RELAYS, ...DEFAULT_RELAYS, 'wss://relay.nuts.cash'])
		);
		const requests = communityRoleSetsQuery(addresses, relays);

		if (!requests.length) {
			adminRelaysLoading = false;
			return;
		}

		unsubscribeRelaySets = useSubscription(
			'community_role_sets_' + pubkey,
			requests,
			handleAdminRelaySet,
			{ bytesPerEvent: 10 * 1024 }
		);
		window.setTimeout(() => {
			if (!adminRelaySets.length) adminRelaysLoading = false;
		}, 1800);
	}

	function handleRelayFeed(message: WorkerMessage) {
		const parsedEvent = isParsedEvent(message);
		if (!parsedEvent || parsedEvent.kind() !== 10012) return;
		relayFeedReady = true;
		subscribeAdminRelaySets(relaySetAddressesFromRelayFeedEvent(parsedEvent));
	}

	function handleAdminRelaySet(message: WorkerMessage) {
		const parsedEvent = isParsedEvent(message);
		if (!parsedEvent || parsedEvent.kind() !== 30002) return;
		if (relayRoleFromSet(parsedEvent) !== 'admin') return;
		const address = `30002:${parsedEvent.pubkey()}:nuts-relays-admin`;
		const existingIndex = adminRelaySets.findIndex(
			(event) => `30002:${event.pubkey()}:nuts-relays-admin` === address
		);
		if (existingIndex !== -1) {
			if (parsedEvent.createdAt() <= adminRelaySets[existingIndex].createdAt()) return;
			adminRelaySets = adminRelaySets.map((event, index) =>
				index === existingIndex ? parsedEvent : event
			);
		} else {
			adminRelaySets = [...adminRelaySets, parsedEvent];
		}
		loadAdminRelayInfos();
	}

	onMount(() => {
		if (!$key?.pub) return;
		adminRelaysLoading = true;
		const relays = Array.from(
			new Set([...INDEXER_RELAYS, ...DEFAULT_RELAYS, 'wss://relay.nuts.cash'])
		);
		const requests = communityDirectoryQuery($key.pub, relays);
		unsubscribeRelayFeed = useSubscription(
			'community_directory_' + $key.pub,
			requests,
			handleRelayFeed,
			{ bytesPerEvent: 10 * 1024 }
		);
		window.setTimeout(() => {
			if (!relayFeedReady) adminRelaysLoading = false;
		}, 1800);
	});

	onDestroy(() => {
		unsubscribeRelayFeed?.();
		unsubscribeRelaySets?.();
	});
</script>

<div class="h-screen bg-base-300 bg-opacity-85">
	<div class="w-feed md:pt-4 pt-safe">
		<div class="px-4 flex justify-between">
			<div on:click={animator.goBack}>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</div>
		</div>
		<div class="flex items-center justify-between px-4 mt-4">
			<div class="flex gap-2">
				{#each accounts as key, index (key)}
					<button
						on:click={() => (index ? manager.switchAccount(key) : go('kind0'))}
						class="btn btn-circle"
					>
						<Avatar pubkey={key} size="xl" customClass={!index ? 'border border-accent' : ''} />
					</button>
				{/each}
				<button class="btn btn-outline btn-circle" on:click={() => go('login')}>
					<!-- <Icon icon="mingcute:add" class="text-xl" /> -->
					<Icon icon="material-symbols:add" class="text-xl" />
				</button>
			</div>
		</div>
	</div>
	<div class="p-4 overflow-scroll">
		<div class="join bg-base-200 rounded-md w-full">
			<div class="join-item p-2">
				<Icon icon="carbon:search" />
			</div>
			<input
				placeholder="Search"
				bind:value={search}
				class="join-item flex-grow px-2 outline-none bg-transparent"
			/>
		</div>
		<div class="my-4 rounded-lg border">
			<div
				class="flex items-center justify-around py-4 border-b last:border-none cursor-pointer"
				on:click|stopPropagation={() => go('logout')}
			>
				<Icon icon="mdi:logout" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Log out</strong>
					<!-- <p class="text-xs">Notifications</p> -->
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<!-- <div class="flex items-center justify-around py-4 border-b last:border-none">
			<Icon icon="mdi:bell-outline" class="w-16 h-6" />
			<div class="flex-grow">
				<strong>Notifications</strong>
			</div>
			<Icon icon="carbon:arrow-right" class="w-16 h-6" />
		</div> -->
		</div>
		<h3 class="font-bold">Profile</h3>
		<div class="my-4 rounded-lg border">
			<div
				class="flex items-center justify-around py-4 border-b last:border-none"
				on:click|stopPropagation={() => go('nprofile:' + $key?.pub)}
			>
				<Icon icon="mdi:account-outline" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>My Profile</strong>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div
				class="flex items-center justify-around py-4 border-b last:border-none"
				on:click|stopPropagation={() => go('keys')}
			>
				<Icon icon="wpf:keysecurity" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Keys</strong>
					<!-- <p class="text-xs">Notifications</p> -->
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div class="flex items-center justify-around py-2 border-b" on:click={() => go('relays')}>
				<Icon icon="game-icons:bird-mask" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Relays</strong>
					<p class="text-xs">Your relay of choice</p>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div class="flex items-center justify-around py-2 border-b" on:click={() => go('wallet')}>
				<Icon icon="mdi:bank-outline" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Wallet</strong>
					<p class="text-xs">Your wallet preferences</p>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div class="flex items-center justify-around py-2" on:click={() => go('theme')}>
				<Icon icon="mdi:palette" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Theme</strong>
					<p class="text-xs">Customize your appearance</p>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
		</div>
		<h3 class="font-bold">Your communities</h3>
		<div class="my-4 rounded-lg border">
			{#if adminRelaysLoading}
				<div class="flex items-center gap-3 p-4">
					<span class="loading loading-spinner loading-sm"></span>
					<span class="text-sm">Checking communities</span>
				</div>
			{:else if adminRelays.length}
				{#each adminRelays as relay (relay.url)}
					<button
						type="button"
						class="flex w-full items-center justify-around py-3 text-left border-b last:border-none"
						on:click={() => openCommunityDashboard(relay.url)}
					>
						<Icon icon="mingcute:server-line" class="w-16 h-6" />
						<div class="min-w-0 flex-grow pr-3">
							<strong class="block truncate">{relay.name || relay.url}</strong>
							<p class="truncate text-xs opacity-70">{relay.url}</p>
							{#if relay.error}
								<p class="text-xs text-warning">{relay.error}</p>
							{/if}
						</div>
						<Icon icon="carbon:arrow-right" class="w-16 h-6" />
					</button>
				{/each}
			{:else}
				<div class="p-4 text-sm opacity-70">No communities found.</div>
			{/if}
		</div>
	</div>
</div>
