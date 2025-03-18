<script lang="ts">
	import { onMount } from 'svelte';
	import { cachedProfile, isInitialized } from 'src/db';
	import type { Kind0Parsed } from 'src/parsers';

	// The pubkey/npub of the user
	export let pubkey: string = '';
	// Optional size parameter to adjust the circle dimensions
	export let size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'xs';
	// Optional custom class to override default styling
	export let customClass: string = '';

	let profile: Kind0Parsed | undefined;
	let imageUrl: string = '';
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
		if (pubkey && $isInitialized) {
			try {
				const cachedData = cachedProfile(pubkey);
				if (cachedData?.content) {
					profile = JSON.parse(cachedData.content);
					// Get profile picture URL
					imageUrl = profile?.picture || '/ns-naked.svg';
				} else {
					// Use fallback if no profile
					imageUrl = '/ns-naked.svg';
				}
			} catch (e) {
				console.error('Error loading profile picture:', e);
				imageUrl = '/ns-naked.svg';
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
		<div class="w-full h-full bg-gray-300 animate-pulse"></div>
	{/if}
</div>
