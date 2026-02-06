<script lang="ts">
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		type ParsedEvent,
		type Kind0Parsed,
		type SubscribeKind,
		type WorkerMessage,
		MessageType
	} from '@candypoets/nipworker';
	import { asKind0, isKind0 } from '@candypoets/nipworker/utils';

	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { onMount } from 'svelte';
	import { userQuery } from '../queries/user';
	import { go } from '../modals/modal';

	// The pubkey/npub of the user
	export let pubkey: string = '';
	// Optional size parameter to adjust the circle dimensions
	export let size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'xs';
	// Optional custom class to override default styling
	export let customClass: string = '';
	export let context: ParsedEvent[] = [];
	export let query = true;
	export let link = false;

	let profile: Kind0Parsed | undefined;
	let imageUrl: string | undefined;
	let proxiedImageUrl: string | undefined;

	let sub: (() => void) | undefined;

	// Size mapping to Tailwind classes
	const sizeClasses = {
		xs: 'w-4 h-4',
		sm: 'w-6 h-6',
		md: 'w-8 h-8',
		lg: 'w-10 h-10',
		xl: 'w-12 h-12'
	};

	onMount(() => {
		try {
			profile = context.find((c) => asKind0(c)) as Kind0Parsed | undefined;
			imageUrl = profile?.picture && profile?.picture()?.toString();
			proxiedImageUrl = imageUrl ? proxyAvatarUrl(imageUrl) : undefined;
			if (!profile && query) {
				sub = useSubscription(
					'u_' + pubkey,
					userQuery(pubkey),
					(message: WorkerMessage) => {
						switch (message.type()) {
							case MessageType.ParsedNostrEvent:
								const kind0 = isKind0(message);
								if (kind0) {
									profile = kind0;
									imageUrl = kind0?.picture && kind0.picture()?.toString();
									proxiedImageUrl = imageUrl ? proxyAvatarUrl(imageUrl) : undefined;
									sub?.();
								}
						}
					},
					{}
				);
			}
		} catch (error) {
			console.error(error);
		}

		return () => sub?.();
	});
	function goto() {
		if (!link) return;
		const profilePath = `nprofile:${pubkey}`;
		go(profilePath);
	}
</script>

<!-- Profile picture with fallback and sizing -->
<div
	class={`${sizeClasses[size]} rounded-full border overflow-hidden bg-gray-200 flex-shrink-0 ${customClass}`}
	on:click={goto}
>
	{#if proxiedImageUrl}
		<img src={proxiedImageUrl} alt="Profile" class="w-full h-full object-cover" />
	{:else}
		<!-- Placeholder while loading -->
		<div class="w-full h-full bg-gray-300 shimmer"></div>
	{/if}
</div>
