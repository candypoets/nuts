<script lang="ts">
	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/parsers';
	import { nostrManager, type EventKind } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';

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
	let imageLoaded = false;
	let imageError = false;

	// Size mapping to Tailwind classes
	const sizeClasses = {
		xs: 'w-4 h-4',
		sm: 'w-6 h-6',
		md: 'w-8 h-8',
		lg: 'w-10 h-10',
		xl: 'w-12 h-12'
	};

	// Try to fetch profile from IndexedDB when pubkey changes or DB is initialized
	$: {
		if (!profile) {
			profile = context.find((c) => c.pubkey === pubkey && c.kind == 0)?.parsed as
				| Kind0Parsed
				| undefined;
			imageUrl = profile?.picture;
			if (!profile && query) {
				nostrManager.subscribe(
					'avatar_' + pubkey + size,
					[{ kinds: [0], authors: [pubkey], limit: 1, cacheFirst: true, relays: [] }],
					(events: ParsedEvent<AnyKind>[], type: EventKind) => {
						const [event, ...context] = events;
						if (isKind0(event)) {
							profile = event.parsed as Kind0Parsed;
							imageUrl = profile?.picture;
						}
					}
				);
			}
		}
	}

	// Handle image load success
	function handleImageLoad() {
		imageLoaded = true;
		imageError = false;
	}

	// Handle image load error
	function handleImageError() {
		imageError = true;
		imageUrl = '/ns-naked.svg';
	}
</script>

<!-- Profile picture with fallback and sizing -->
<div
	class={`${sizeClasses[size]} rounded-full overflow-hidden bg-gray-200 flex-shrink-0 ${customClass}`}
>
	{#if imageUrl}
		<img
			src={imageUrl}
			alt="Profile"
			class="w-full h-full object-cover"
			on:load={handleImageLoad}
			on:error={handleImageError}
		/>
	{:else}
		<!-- Placeholder while loading -->
		<div class="w-full h-full bg-gray-300 shimmer"></div>
	{/if}
</div>
