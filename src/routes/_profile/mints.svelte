<script lang="ts">
	import Icon from '@iconify/svelte';
	import { isMintUrlValid } from 'src/actions/mint';
	import { db, dbMints } from 'src/stores/db';
	import { Drawer } from 'vaul-svelte';

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
			$db.mints.put({ url: newMintUrl, enabled: true });

			newMintUrl = '';
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
				<h2 class="font-bold text-xl">Mints</h2>
				<div class="w-1/4"></div>
			</div>
			<div class="space-y-4">
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
								on:change={() => $db.mints.put({ ...mint, enabled: !mint.enabled })}
							/>
						</div>
					{/each}
				</div>
			</div>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.NestedRoot>
