<script lang="ts">
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import CommunityStorefront from 'src/components/storefront/CommunityStorefront.svelte';
	import { fetchRelayInfo, relayInfos, setSubRelays } from 'src/controller/relay';
	import {
		COMMUNITY_PROFILE_D,
		COMMUNITY_PROFILE_KIND,
		parseCommunityProfile,
		type CommunityProfile
	} from 'src/lib/communityProfile';
	import { storePresetFor } from 'src/lib/communityTypes';
	import { onDestroy, onMount } from 'svelte';

	export let relay: string;
	export let visible = true;
	export let goBack: (() => void) | undefined;

	let communityProfile: CommunityProfile | undefined;
	let profileSub: (() => void) | undefined;
	let activeRelay = '';
	let mounted = false;

	$: normalizedRelay = normalizeRelay(relay);
	$: relayInfo = $relayInfos.get(normalizedRelay);
	$: communityName = relayInfo?.name?.trim() || relayLabel(normalizedRelay);
	$: communityType = communityProfile?.type || 'other';
	$: preset = storePresetFor(communityType);
	$: if (mounted && visible && normalizedRelay && normalizedRelay !== activeRelay) {
		subscribeProfile();
	}

	function normalizeRelay(value: string) {
		try {
			return value ? normalizeURL(value) : '';
		} catch {
			return '';
		}
	}

	function relayLabel(url: string) {
		return url
			.replace(/^wss?:\/\//, '')
			.replace(/^relay\./, '')
			.replace(/\/$/, '');
	}

	function relayHash(url: string) {
		return url.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
	}

	function subscribeProfile() {
		profileSub?.();
		profileSub = undefined;
		activeRelay = normalizedRelay;
		communityProfile = undefined;
		if (!normalizedRelay) return;

		void fetchRelayInfo(normalizedRelay);
		const subId = `community_store_profile_${relayHash(normalizedRelay)}`;
		setSubRelays(subId, [normalizedRelay]);
		profileSub = useSubscription(
			subId,
			[
				{
					kinds: [COMMUNITY_PROFILE_KIND],
					limit: 5,
					noCache: true,
					relays: [normalizedRelay],
					tags: { '#d': [COMMUNITY_PROFILE_D] }
				}
			],
			(message) => {
				const parsed = asParsedEvent(message);
				if (!parsed) return;
				const profile = parseCommunityProfile(parsed);
				if (!profile) return;
				if (communityProfile && profile.createdAt <= communityProfile.createdAt) return;
				communityProfile = profile;
			},
			{ bytesPerEvent: 4 * 1024, closeOnEose: true }
		);
	}

	onMount(() => {
		mounted = true;
		subscribeProfile();
	});
	onDestroy(() => profileSub?.());
</script>

<svelte:head>
	<title>{preset.title} · {communityName} · Nuts</title>
</svelte:head>

<div class="w-feed h-full min-h-screen max-w-full overflow-y-auto bg-base-300">
	<header class="sticky top-0 z-10 bg-base-100/90 backdrop-blur-md">
		<div class="flex w-full items-center gap-3 px-4 py-3 pt-safe">
			<button
				type="button"
				on:click={goBack}
				class="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-base-200"
				aria-label={`Back to ${communityName}`}
			>
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<div class="min-w-0 flex-1">
				<p class="truncate text-base font-black">{preset.title}</p>
				<p class="truncate text-xs font-semibold text-base-content/60">{communityName}</p>
			</div>
		</div>
	</header>

	<main class="w-full px-4 pt-4 pb-safe">
		<CommunityStorefront relay={normalizedRelay} {communityType} />
	</main>
</div>
