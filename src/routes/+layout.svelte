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

		// Clean up old tx-recovery data from localStorage
		localStorage.removeItem('activeTxId');
		localStorage.removeItem('pendingBackups_v1');

		// Delete the old tx-recovery IndexedDB database
		try {
			indexedDB.deleteDatabase('nuts-cash-tx-recovery');
		} catch (e) {
			// Ignore errors
		}

		// Resume any pending transactions and clean up old ones
		resumePendingTransactions().catch(console.error);
		clearOldTransactions().catch(console.error);

		// Expose debug functions to window for console debugging
		// @ts-ignore
		window.nutsDebug = {
			// Retry failed nutzap publishes
			retryPublish: async (txId?: string) => {
				const { retryPublish, getTransaction, listPendingPublish } = await import('src/model/cashu/tx-recovery');
				if (txId) {
					return retryPublish(txId);
				} else {
					// Retry all pending
					const pending = await listPendingPublish();
					console.log(`[nutsDebug] Retrying ${pending.length} pending publishes`);
					for (const tx of pending) {
						await retryPublish(tx.txId);
					}
					return `Retried ${pending.length} transactions`;
				}
			},
			// List pending publish transactions
			listPendingPublish: async () => {
				const { listPendingPublish } = await import('src/model/cashu/tx-recovery');
				return listPendingPublish();
			},
			// Get transaction details
			getTransaction: async (txId: string) => {
				const { getTransaction } = await import('src/model/cashu/tx-recovery');
				return getTransaction(txId);
			},
			// Retry pending proof backups
			retryBackups: async () => {
				const { retryPendingBackups, getPendingBackups } = await import('src/model/cashu/tx-recovery');
				await retryPendingBackups();
				return getPendingBackups();
			},
			// Get pending backup status
			getPendingBackups: async () => {
				const { getPendingBackups } = await import('src/model/cashu/tx-recovery');
				return getPendingBackups();
			}
		};
		console.log('[nuts-cash] Debug functions available at window.nutsDebug:', Object.keys(window.nutsDebug));

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
