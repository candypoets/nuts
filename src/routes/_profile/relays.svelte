<script lang="ts">
	import Icon from '@iconify/svelte';
	import { checkNostrRelay } from 'src/actions/relay';
	import { db, dbRelays } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { Drawer } from 'vaul-svelte';

	export let subopen: boolean = false;
	let newRelayUrl = '';
	let loading = false;
	let isInvalid = false;

	async function addRelay() {
		loading = true;
		const isValid = await checkNostrRelay(newRelayUrl);
		console.log('isValid', isValid);
		loading = false;
		isInvalid = !isValid;
		if (isValid) {
			$db.relays.put({ url: newRelayUrl, enabled: true });
			$pool.relay(newRelayUrl);
			newRelayUrl = '';
		}
	}
</script>

<Drawer.NestedRoot bind:open={subopen}>
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40" />
		<Drawer.Content
			class="pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 p-4 h-screen"
			style="height: 95vh;"
		>
			<div class="flex justify-between mb-12">
				<div class="w-1/4" on:click={() => (subopen = false)}>
					<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
				</div>
				<h2 class="font-bold text-xl">Relays</h2>
				<div class="w-1/4"></div>
			</div>
			<div class="space-y-4">
				<div class="join w-full">
					<input
						class="w-full join-item px-2"
						class:input-error={isInvalid}
						type="text"
						bind:value={newRelayUrl}
						placeholder="Enter new relay URL"
					/>
					{#if loading}
						<button class="btn join-item"><span class="loading loading-dots"></span></button>
					{:else}
						<button class="btn join-item" on:click={() => addRelay()}>Add</button>
					{/if}
				</div>
				<div class="">
					{#each $dbRelays as relay, index}
						<div class="flex justify-between items-center border-b last:border-none py-4">
							<span>{relay.url}</span>
							<input
								type="radio"
								class="radio radio-primary"
								checked={relay.enabled}
								on:change={() => $db.relays.put({ ...relay, enabled: !relay.enabled })}
							/>
						</div>
					{/each}
				</div>
			</div>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.NestedRoot>
