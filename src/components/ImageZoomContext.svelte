<script lang="ts">
	import Icon from '@iconify/svelte';
	import { nip19 } from 'nostr-tools';
	import { note, zoomed } from 'src/controller/image';
	import { useSubscription, type SubscribeKind } from 'src/model/nostr-main';
	import Kind1 from 'src/routes/_kinds/kind1.svelte';
	import { userQuery } from 'src/routes/queries/user';
	import { isKind10002, type AnyKind, type ParsedEvent } from 'src/types';
	import { setContext } from 'svelte';
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
		useSubscription(
			'u_' + $note.pubkey,
			userQuery($note.pubkey),
			(events: ParsedEvent<AnyKind>[], kind: SubscribeKind) => {
				if (kind == 'EOSE') {
					return;
				}
				const [event] = events;
				if (isKind10002(event)) {
					const relays = event.parsed?.filter((r) => !!r.write).map((r) => r.url) || [];
					console.log('relays', relays);
					nevent = nip19.neventEncode({ id: $note.id, relays });
					usub?.();
				}
			}
		);

	setContext('imageContext', true);
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
			class="md:block hidden h-full w-1/4 min-w-96 overflow-auto bg-base-100 border-l border-base-300"
			transition:slide={{ duration: 200, axis: 'x' }}
			on:click|stopPropagation
		>
			<div class="p-4 overflow-y-auto h-full">
				{#if nevent.length}
					<Kind1 {nevent} visible />
				{/if}
			</div>
		</div>
	{/if}
{/key}
