<script lang="ts">
	// import '../app.css';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	import Icon from '@iconify/svelte';
	let theme = 'dark';

	onMount(() => {
		if (localStorage.getItem('theme')) {
			theme = localStorage.getItem('theme');
			document
				.getElementsByTagName('html')[0]
				.setAttribute('data-theme', localStorage.getItem('theme'));
		}
	});

	$: {
		if (browser) {
			document.getElementsByTagName('html')[0].setAttribute('data-theme', theme);
			document
				.querySelector('meta[name="theme-color"]')
				?.setAttribute('content', theme === 'dark' ? '#131716' : '#f9fafb');
		}
	}

	function saveThemeSelection() {
		localStorage.setItem('theme', theme);
	}
</script>

<button
	on:click={(_) => {
		console.log('theme changed');
		if (theme == 'dark') {
			theme = 'light';
			saveThemeSelection();
		} else if (theme == 'light') {
			theme = 'dark';
			saveThemeSelection();
		}
	}}
	class="lg:h-8 lg:w-8 lg:p-1 p-4 items-center justify-center cursor-pointer lg:fixed lg:bottom-8 lg:left-8 z-40"
>
	{#if theme === 'dark'}
		<Icon icon="ph:moon-bold" class="lg:text-3xl text-2xl text-primary" />
	{:else if theme === 'light'}
		<Icon icon="ph:sun-bold" class="lg:text-3xl text-2xl text-primary" />
	{/if}
</button>
