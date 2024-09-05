<script lang="ts">
	import Icon from '@iconify/svelte';
	import { isMintUrlValid } from 'src/actions/mint';
	import { db, dbMints, mintsCache } from 'src/stores/db';
	import SubLayer from 'src/comp/drawers/SubLayer.svelte';

	export let subopen: boolean = false;
	let newMintUrl = '';
	let loading = false;
	let isInvalid = false;

	async function addMint() {
		loading = true;
		const isValid = await isMintUrlValid(newMintUrl);
		console.log('isValid', isValid);
		loading = false;
		isInvalid = !isValid;
		if (isValid) {
			mintsCache.put({ url: newMintUrl, enabled: true });

			newMintUrl = '';
		}
	}

	$: console.log($dbMints);
</script>

<SubLayer bind:open={subopen}>
	<div class="flex justify-between mb-12 px-4">
		<div class="w-1/4" on:click={() => (subopen = false)}>
			<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
		</div>
		<h2 class="font-bold text-xl">Mints</h2>
		<div class="w-1/4"></div>
	</div>
	<div class="space-y-4 px-4">
		<div class="join w-full">
			<input
				class="w-full join-item px-2"
				class:input-error={isInvalid}
				type="text"
				bind:value={newMintUrl}
				placeholder="Enter new mint URL"
			/>
			{#if loading}
				<button class="btn join-item"><span class="loading loading-dots"></span></button>
			{:else}
				<button class="btn join-item" on:click={() => addMint()}>Add</button>
			{/if}
		</div>
		<div class="">
			{#each $dbMints as mint, index}
				<div class="flex justify-between items-center border-b last:border-none py-4">
					<span>{mint.url}</span>
					<input
						type="radio"
						class="radio radio-primary"
						checked={mint.enabled}
						on:click={() => mintsCache.put({ ...mint, enabled: !mint.enabled })}
					/>
				</div>
			{/each}
		</div>
	</div>
</SubLayer>
