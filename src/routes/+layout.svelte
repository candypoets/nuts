<script lang="ts">
	import 'src/app.css';
	import { pwaInfo } from 'virtual:pwa-info';
	import App from 'src/routes/index.svelte';
	import ImageZoom from 'src/components/ImageZoom.svelte';
	import LiveStream from 'src/components/LiveStream.svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { dimensions, key } from 'src/controller';
	import { initRelayTracking } from 'src/controller/relay';
	import { zoomed, liveStreamOpen } from 'src/controller/image';
	import { resumePendingTransactions, clearOldTransactions } from 'src/model/cashu/tx-recovery';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

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
		let theme = localStorage.getItem('theme') || 'matteblack';
		setViewport();
		initRelayTracking();
		document.getElementsByTagName('html')[0].setAttribute('data-theme', theme);
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', theme === 'dark' ? '#131716' : '#f9fafb');

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

{#key $key?.pub}
	<App />
{/key}

{#if $zoomed !== undefined}
	<ImageZoom />
{/if}
{#if $liveStreamOpen}
	<LiveStream />
{/if}
