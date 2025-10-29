<script lang="ts">
	import StatusCircle from './StatusCircle.svelte';
	import type { ConnectionStatus } from '@candypoets/nipworker';
	import { normalizeURL } from 'nostr-tools/utils';

	export let connectionStatus: { [relayUrl: string]: ConnectionStatus } = {};

	$: relays = Object.keys(connectionStatus) || ['damus'];

	function getRelayName(url: string): string {
		try {
			const domain = new URL(url).hostname;
			return domain.replace(/^www\./, '');
		} catch (e) {
			return url;
		}
	}
</script>

<div
	class="fixed h-[100vh] left-5 top-5 flex flex-col justify-center gap-3 z-50 pointer-events-none"
>
	<!-- {JSON.stringify(connectionStatus)} -->
	{#each relays as relay}
		{#if connectionStatus[relay]}
			<div class="pointer-events-auto">
				<StatusCircle relayName={getRelayName(relay)} status={connectionStatus[relay]} size={10} />
			</div>
		{/if}
	{/each}
</div>
