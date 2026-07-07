<script lang="ts">
	import 'src/app.css';
	import { pwaInfo } from 'virtual:pwa-info';
	import App from 'src/routes/index.svelte';
	import ImageZoom from 'src/components/ImageZoom.svelte';
	import LiveStream from 'src/components/LiveStream.svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { dimensions, key, loadStoredTheme } from 'src/controller';
	import { initRelayTracking } from 'src/controller/relay';
	import { zoomed, liveStreamOpen } from 'src/controller/image';
	import { resumePendingTransactions, clearOldTransactions } from 'src/model/cashu/tx-recovery';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';
	$: standaloneRoute =
		$page.url.pathname.startsWith('/create') ||
		$page.url.pathname.startsWith('/admin') ||
		$page.url.pathname.startsWith('/redeem');

	function setViewport() {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
		document.documentElement.style.setProperty(
			'--vw',
			`${document.documentElement.clientWidth * 0.01}px`
		);

		$dimensions.width = window.innerWidth;
		$dimensions.height = window.innerHeight;
	}

	onMount(() => {
		setViewport();
		initRelayTracking();

		// Load stored theme from localStorage or use default
		const storedTheme = loadStoredTheme();
		if (!storedTheme) {
			// Apply default theme if no stored theme
			document.getElementsByTagName('html')[0].setAttribute('data-theme', 'downfox');
		}

		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute(
				'content',
				document.documentElement.getAttribute('data-theme') === 'snowwhite' ? '#f9fafb' : '#131716'
			);

		window.addEventListener('resize', setViewport);
		// Visual Viewport API for better keyboard detection
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', setViewport);
		}

		// Resume any pending transactions and clean up old ones
		resumePendingTransactions().catch(console.error);
		clearOldTransactions().catch(console.error);

		return () => {
			window.removeEventListener('resize', setViewport);
			if (window.visualViewport) {
				window.visualViewport.removeEventListener('resize', setViewport);
			}
		};
	});
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>

{#if standaloneRoute}
	<slot />
{:else}
	{#key $key?.pub}
		<App />
	{/key}
{/if}

{#if $zoomed !== undefined}
	<ImageZoom />
{/if}
{#if $liveStreamOpen}
	<LiveStream />
{/if}
