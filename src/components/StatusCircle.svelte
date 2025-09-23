<script lang="ts">
	import type { ConnectionStatus } from '@candypoets/nipworker';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	export let relayName = '';
	export let status: ConnectionStatus;
	export let size = 15; // px diameter

	const dispatch = createEventDispatcher();

	let removalTimer: ReturnType<typeof setTimeout> | null = null;
	let absoluteMaxTimer: ReturnType<typeof setTimeout> | null = null;
	let visible = false;

	// First letter for display
	$: firstLetter = relayName?.trim()?.charAt(0)?.toUpperCase() || '?';

	function getColorClasses(s: ConnectionStatus) {
		switch (s.status()?.toString()) {
			case 'EOSE':
				return 'bg-green-500';
			case 'FAILED':
				return 'bg-red-500';
			case 'SUBSCRIBED':
				return 'bg-blue-500 animate-pulse';
			case 'OK':
				return s.message()?.toString() == 'false' ? 'bg-red-500' : 'bg-green-400';
			case 'SENT':
				return 'bg-gray-300 opacity-50';
			case 'CLOSED':
				return 'bg-gray-500';
			case 'NOTICE':
				return 'bg-yellow-500';
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

		if (status && status.status()?.toString() !== 'OK') {
			removalTimer = setTimeout(() => {
				// Notify parent we should be removed
				visible = false;
			}, 2000);
		}
	}

	onMount(() => {
		visible = true;
		absoluteMaxTimer = setTimeout(() => {
			visible = false;
		}, 4000);
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
		class={`flex items-center border border-base-300 justify-center rounded-full text-white font-semibold select-none text-xs ${getColorClasses(
			status
		)}`}
		style="width:{size}px;height:{size}px;"
		title={relayName}
	>
		{firstLetter}
	</div>
{/if}
