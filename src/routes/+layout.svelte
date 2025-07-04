<script lang="ts">
	import 'src/app.css';
	import { pwaInfo } from 'virtual:pwa-info';
	import App from 'src/routes/index.svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	onMount(() => {
		let theme = localStorage.getItem('theme') || 'dark';
		document.getElementsByTagName('html')[0].setAttribute('data-theme', theme);
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', theme === 'dark' ? '#131716' : '#f9fafb');
	});
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>
<App />
