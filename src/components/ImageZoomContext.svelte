<script lang="ts">
	import Icon from '@iconify/svelte';
	import { nip19 } from 'nostr-tools';
	import { note, zoomed } from 'src/controller/image';
	import Kind1 from 'src/routes/_kinds/kind1.svelte';
	import { getUserRelays } from 'src/routes/queries/user';
	import { onDestroy, setContext } from 'svelte';
	import { slide } from 'svelte/transition';

	// Toggle to show/hide the context panel
	export let showContext: boolean = true;
	// Visibility state for lazy loading
	export let visible: boolean = true;

	let nevent: string = '';

	// Toggle context panel
	function toggleContext() {
		showContext = !showContext;
	}

	$: usub =
		$note &&
		!nevent &&
		getUserRelays(
			$note.pubkey(),
			(relays) => {
				nevent = nip19.neventEncode({ id: $note.id(), relays });
			},
			'write'
		);

	setContext('imageContext', true);

	onDestroy(() => usub && usub?.());
</script>

<!-- Context toggle button -->
<button
	class="absolute top-4 right-96 z-[60] p-2 text-base-content hover:bg-opacity-100"
	on:click|preventDefault|stopPropagation={toggleContext}
	class:!right-4={!showContext}
>
	<Icon
		icon={showContext ? 'mdi:chevron-double-right' : 'mdi:chevron-double-left'}
		class="text-4xl text-white"
	/>
</button>

{#key $note.id}
	<!-- Context panel -->
	{#if showContext && $zoomed !== undefined}
		<div
			class="md:block hidden h-full w-1/4 min-w-96 overflow-auto"
			transition:slide={{ duration: 200, axis: 'x' }}
			on:click|stopPropagation
		>
			<div class="overflow-y-auto h-full">
				{#if nevent.length}
					<Kind1 {nevent} visible />
				{/if}
			</div>
		</div>
	{/if}
{/key}
