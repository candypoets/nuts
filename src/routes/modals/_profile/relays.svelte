<script lang="ts">
	import Icon from '@iconify/svelte';

	export let subopen: boolean = false;
	let newRelayUrl = '';
	let loading = false;
	let isInvalid = false;

	async function addRelay() {
		loading = true;
		// const isValid = await checkNostrRelay(newRelayUrl);
		// console.log('isValid', isValid);
		// loading = false;
		// isInvalid = !isValid;
		// if (isValid) {
		// 	db.relays.put({ url: newRelayUrl, enabled: true });
		// 	pool.addRelay(newRelayUrl);
		// 	newRelayUrl = '';
		// }
	}
</script>

<div class="h-full bg-basic pt-4">
	<div class="flex justify-between mb-12 px-4">
		<div class="w-1/4" on:click={() => (subopen = false)}>
			<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
		</div>
		<h2 class="font-bold text-xl">Relays</h2>
		<div class="w-1/4"></div>
	</div>
	<div class="space-y-4 px-4">
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
			<!-- {#each $dbRelays as relay, index}
				<div class="flex justify-between items-center border-b last:border-none py-4">
					<span>{relay.url}</span>
					<input
						type="radio"
						class="radio radio-primary"
						checked={relay.enabled}
						on:click={() => db.relays.put({ ...relay, enabled: !relay.enabled })}
					/>
				</div>
			{/each} -->
		</div>
	</div>
</div>
