<script lang="ts">
	import Icon from '@iconify/svelte';
	import SubLayer from 'src/comp/drawers/SubLayer.svelte';
	import { db, keyDB, key, keysCache, activeAccount } from 'src/stores/db';
	export let subopen: boolean = false;
	import { Drawer } from 'vaul-svelte';
</script>

<SubLayer bind:open={subopen}>
	<div class="px-4">
		<div on:click={() => (subopen = false)}>
			<Icon icon="mdi:close" class="w-6 h-6" />
		</div>
	</div>
	<div class="flex flex-col gap-4 justify-around px-6 h-80">
		<div class="text-center font-semibold">
			Make sure you saved your private key before logging out
		</div>
		<button
			class="btn btn-primary"
			on:click={async () => {
				keysCache.delete($key?.pub);
				await $db.delete();
				$activeAccount = 0;
			}}
		>
			Log Out
		</button>
	</div>
</SubLayer>
