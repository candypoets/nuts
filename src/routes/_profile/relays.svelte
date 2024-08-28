<script lang="ts">
	import Icon from '@iconify/svelte';
	import { db, dbRelays } from 'src/stores/db';
	import { eventMap } from 'src/stores/nuts';
	export let subopen: boolean = false;
	import { Drawer } from 'vaul-svelte';

	let newRelayUrl = '';
</script>

<Drawer.NestedRoot>
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40" />
		<Drawer.Content
			class="pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 p-4 h-screen"
			style="height: 95vh;"
		>
			<div class="space-y-4">
				<div class="flex space-x-2">
					<input type="text" bind:value={newRelayUrl} placeholder="Enter new relay URL" />
					<button class="btn" on:click={() => $db.relays.put({ url: newRelayUrl })}>Add</button>
				</div>
				<div class="space-y-2">
					{#each $dbRelays as relay, index}
						<div class="flex justify-between items-center">
							<span>{relay.url}</span>
							<input
								type="checkbox"
								class="toggle"
								checked={relay.enabled}
								on:change={() => toggleRelay(index)}
							/>
						</div>
					{/each}
				</div>
			</div></Drawer.Content
		>
	</Drawer.Portal>
</Drawer.NestedRoot>
