<script lang="ts">
	import Icon from '@iconify/svelte';
	import { db, keyDB, keys } from 'src/stores/db';
	export let subopen: boolean = false;
	import { Drawer } from 'vaul-svelte';
</script>

<Drawer.NestedRoot bind:open={subopen}>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40" />
		<Drawer.Content class="pb-8 pt-3 bg-basic absolute top-4 left-0 right-0" style="height: 95vh;">
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
						$keys = [];
						keyDB.keys.clear();
						$db.delete();
					}}
				>
					Log Out
				</button>
			</div>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.NestedRoot>
