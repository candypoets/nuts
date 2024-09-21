<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import '../app.css';
	$: homepage = $page.route.id == '/';
</script>

<div
	class="fixed hidden bg-transparent h-screen top-0 lg:flex flex-col justify-center items-center w-20 gap-8 left-4 z-10"
>
	<a
		class:text-primary={$page.route?.id?.startsWith('/home')}
		href={'/home'}
		class="flex flex-col items-center justify-center gap-2"
		on:click|preventDefault={() => goto('/home')}
	>
		<Icon icon="mdi:home" class="text-3xl" />
		<span class="btm-nav-label text-xs">Home</span>
	</a>
	<a
		class:text-primary={$page.route?.id?.startsWith('/explore')}
		href={'/explore'}
		class="flex flex-col items-center justify-center gap-2"
		on:click|preventDefault={() => goto('/explore')}
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
		href={'/chat'}
		class="flex flex-col items-center justify-center gap-2"
		on:click|preventDefault={() => goto('/chat')}
	>
		<Icon icon="material-symbols:chat-outline" class="text-3xl" />
		<span class="btm-nav-label text-xs">Chat</span>
	</a>
</div>
