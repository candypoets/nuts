<script lang="ts">
	import type { ConnectionStatus } from '@candypoets/nipworker';
	import { onDestroy, onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	export let relayName = '';
	export let status: ConnectionStatus;
	export let size = 10; // px diameter

	let removalTimer: ReturnType<typeof setTimeout> | null = null;
	let absoluteMaxTimer: ReturnType<typeof setTimeout> | null = null;
	let visible = false;

	function getColorClasses(s: ConnectionStatus) {
		console.log(s?.status(), s?.status()?.toString());
		switch (s?.status()?.toString()) {
			case 'true':
				return 'bg-green-500';
			case 'false':
				return 'bg-red-500';
			default:
				return 'bg-gray-300 opacity-50';
		}
	}

	// Watch for final status → start removal countdown
	$: {
		// Clear any existing timer
		if (removalTimer) {
			clearTimeout(removalTimer);
			removalTimer = null;
		}

		if (status) {
			removalTimer = setTimeout(() => {
				visible = false;
			}, 5000);
		}
	}

	onMount(() => {
		visible = true;
		absoluteMaxTimer = setTimeout(() => {
			visible = false;
		}, 5000);
	});

	onDestroy(() => {
		if (removalTimer) clearTimeout(removalTimer);
		if (absoluteMaxTimer) clearTimeout(absoluteMaxTimer);
	});
</script>

{#if visible}
	<div
		out:fly={{ y: -1000, duration: 200 }}
		in:fly={{ y: 1000, duration: 200 }}
		class={`rounded-full select-none ${getColorClasses(status)}`}
		style="width:{size}px;height:{size}px;"
		title={relayName}
	>
		<!-- {firstLetter} -->
	</div>
{/if}
