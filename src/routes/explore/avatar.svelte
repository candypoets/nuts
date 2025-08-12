<script lang="ts">
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import type { ParsedEvent, AnyKind, Kind0Parsed, SubscribeKind } from '@candypoets/nipworker';
	import { isKind0 } from '@candypoets/nipworker/utils';

	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { onMount } from 'svelte';
	import { userQuery } from '../queries/user';

	// The pubkey/npub of the user
	export let pubkey: string = '';
	// Optional size parameter to adjust the circle dimensions
	export let size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'xs';
	// Optional custom class to override default styling
	export let customClass: string = '';
	export let context: ParsedEvent<AnyKind>[] = [];
	export let query = true;

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
		profile = context.find((c) => c.pubkey === pubkey && c.kind == 0)?.parsed as
			| Kind0Parsed
			| undefined;
		imageUrl = profile?.picture;
		proxiedImageUrl = imageUrl ? proxyAvatarUrl(imageUrl) : undefined;
		if (!profile && query) {
			sub = useSubscription(
				'u_' + pubkey,
				userQuery(pubkey),
				(events: ParsedEvent<AnyKind>[], type: SubscribeKind) => {
					if (type == 'CONNECTION_STATUS') {
						return;
					}
					const [event, ...context] = events;
					if (isKind0(event)) {
						profile = event.parsed as Kind0Parsed;
						imageUrl = profile?.picture;
						proxiedImageUrl = imageUrl ? proxyAvatarUrl(imageUrl) : undefined;
						sub?.();
						// avoid sub being called twice on unmount
						sub = undefined;
					}
				}
			);
		}

		return () => sub?.();
	});
</script>

<!-- Profile picture with fallback and sizing -->
<div
	class={`${sizeClasses[size]} rounded-full overflow-hidden bg-gray-200 flex-shrink-0 ${customClass}`}
>
	{#if proxiedImageUrl}
		<img src={proxiedImageUrl} alt="Profile" class="w-full h-full object-cover" />
	{:else}
		<!-- Placeholder while loading -->
		<div class="w-full h-full bg-gray-300 shimmer"></div>
	{/if}
</div>
