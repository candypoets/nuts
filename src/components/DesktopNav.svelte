<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import '../app.css';
</script>

<div
	class="fixed hidden h-screen top-0 lg:flex flex-col justify-center items-center w-20 gap-8 left-4 z-10"
	id="desktop-nav"
>
	<a
		class:text-primary={$page.route?.id?.startsWith('/home')}
		href={resolve('/home')}
		class="desktop-nav-item flex flex-col items-center justify-center gap-2"
		on:click|preventDefault={() => goto(resolve('/home'))}
	>
		<Icon icon="mdi:home" class="text-3xl" />
		<span class="btm-nav-label text-xs">Home</span>
	</a>
	<a
		class:text-primary={$page.route?.id?.startsWith('/explore')}
		href={resolve('/explore')}
		class="desktop-nav-item flex flex-col items-center justify-center gap-2"
		on:click|preventDefault={() => goto(resolve('/explore'))}
	>
		<Icon icon="mdi:map-outline" class="text-3xl" />
		<span class="btm-nav-label text-xs">Explore</span>
	</a>
	<!-- <a
		class:text-primary={$page.route?.id?.startsWith('/earn')}
		href={'/earn'}
		on:click|preventDefault={() => goto('/earn')}
	>
		<Icon icon="mdi:chart-line" class="text-3xl" />
		<span class="btm-nav-label text-xs">Earn</span>
	</a> -->
	<a
		class:text-primary={$page.route?.id?.startsWith('/chat')}
		href={resolve('/chat')}
		class="desktop-nav-item flex flex-col items-center justify-center gap-2"
		on:click|preventDefault={() => goto(resolve('/chat'))}
	>
		<Icon icon="material-symbols:chat-outline" class="text-3xl" />
		<span class="btm-nav-label text-xs">Chat</span>
	</a>
</div>

<style>
	#desktop-nav {
		view-transition-name: desktop-nav;
	}

	.desktop-nav-item {
		color: color-mix(in srgb, var(--text-strong) 88%, var(--base-100));
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
	}

	.desktop-nav-item:hover,
	.desktop-nav-item:focus-visible {
		color: var(--text-strong);
	}

	.desktop-nav-item :global(svg) {
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
	}

	.desktop-nav-item.text-primary {
		color: var(--primary);
		text-shadow: none;
	}
</style>
