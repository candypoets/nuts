<script lang="ts">
	import { resolve } from 'src/lib/paths';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import { carouselAnimator } from 'src/controller/carrousel';
	import '../app.css';
	$: homepage = $page.route.id == '/';

	function navigateFeed(index: number) {
		carouselAnimator.navigateTo(index, 400, true);
	}
</script>

<div class="btm-nav lg:hidden bg-transparent h-24 pb-8 z-10" id="footer">
	<a
		class:text-primary={$page.route?.id?.startsWith('/home')}
		href={resolve('/home')}
		on:click|preventDefault={() => navigateFeed(0)}
	>
		<Icon icon="mdi:home" class="text-3xl" />
		<span class="btm-nav-label text-xs">Home</span>
	</a>
	<a
		class:text-primary={$page.route?.id?.startsWith('/explore')}
		href={resolve('/explore')}
		on:click|preventDefault={() => navigateFeed(1)}
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
		on:click|preventDefault={() => navigateFeed(2)}
	>
		<Icon icon="material-symbols:chat-outline" class="text-3xl" />
		<span class="btm-nav-label text-xs">Chat</span>
	</a>
</div>
