<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getContext } from 'svelte';
	import { key } from 'src/controller';

	export let subopen: boolean = false;
	let animator = getContext('animator');
</script>

<div class="h-full py-4 flex items-center">
	<div class="border rounded-xl h-full w-feed lg:h-auto bg-base-300 bg-opacity-85 py-4">
		<div class="px-4">
			<div on:click={animator.goBack}>
				<Icon icon="mdi:close" class="w-6 h-6" />
			</div>
		</div>
		<div class="flex flex-col gap-4 justify-around px-6 h-72">
			<div
				class="text-center font-semibold p-3 bg-yellow-100 border border-yellow-300 rounded-lg flex items-center"
			>
				<Icon icon="mdi:alert-circle" class="w-5 h-5 text-yellow-600 mr-2" />
				<span>Make sure you saved your private key before logging out</span>
			</div>
			<button
				class="btn btn-primary"
				on:click={async () => {
					$key = {};
				}}
			>
				Log Out
			</button>
		</div>
	</div>
</div>
