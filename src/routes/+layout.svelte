<script lang="ts">
	import 'src/app.css';
	import { pwaInfo } from 'virtual:pwa-info';
	import App from 'src/routes/index.svelte';
	import Landing from 'src/routes/+page.svelte';
	import { initNostr } from 'src/model/nostr-main';
	import { page } from '$app/stores';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	$: homepage = $page.route.id == '/';
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>
{#await initNostr()}
	<!-- Loading state while waiting for nostrManager -->
	<div>Loading...</div>
{:then nostrManager}
	{#if nostrManager}
		<!-- <div class="text-white">hoy</div>
		{#if homepage}
			<Landing />
		{:else} -->
		<App />
		<!-- {/if} -->
	{:else}
		<span class="text-white">{import.meta.env.SSR}</span>
		<div>Error: nostrManager failed to initialize {nostrManager}</div>
	{/if}
	<!-- Render the main component once nostrManager is loaded -->
{:catch error}
	<!-- Error state -->
	<div>Error loading nostrManager: {error.message}</div>
{/await}
