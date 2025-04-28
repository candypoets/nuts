<script lang="ts">
	import Icon from '@iconify/svelte';
	import { settings } from 'src/stores/db';
	export let subopen: boolean = false;
</script>

<div class="h-full bg-basic pt-4">
	<div class="flex justify-between mb-12 px-4">
		<div class="w-1/4" on:click={() => (subopen = false)}>
			<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
		</div>
		<h2 class="font-bold text-xl">Zap Settings</h2>
		<div class="w-1/4"></div>
	</div>
	<div class="px-4">
		<div class="mt-8">Message</div>
		<input
			class="p-4 bg-base-200 my-4 rounded-lg w-full"
			inputmode="text"
			type="text"
			value={$settings?.zap?.message || 'self-sovereign zap'}
			on:change={(e) => {
				settings.put({
					zap: {
						message: e?.target?.value
					}
				});
			}}
		/>

		<div class="mt-8">Amount</div>
		<input
			class="p-4 bg-base-200 my-4 rounded-lg w-full"
			inputmode="decimal"
			type="number"
			value={$settings?.zap?.amount || 1000}
			on:change={(e) => {
				settings.put({
					zap: {
						amount: e?.target?.value
					}
				});
			}}
		/>
	</div>
</div>
