<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getContext } from 'svelte';
	import { getManager } from '@candypoets/nipworker';
	import { key, walletMnemonic, walletPassphrase } from 'src/controller';

	export let subopen: boolean = false;
	let animator = getContext('animator');

	const manager = getManager();

	function handleLogout() {
		// Clear persistent stores to prevent stale data on reload
		key.set({});
		walletMnemonic.set('');
		walletPassphrase.set('');

		manager.removeAccount();
		window.location.href = '/explore';
	}
</script>

<div class="h-screen flex items-center">
	<div class="w-feed lg:h-auto h-screen bg-base-300 bg-opacity-85 md:pt-4 pt-safe">
		<div class="px-4">
			<div on:click={animator.goBack}>
				<Icon icon="mdi:close" class="w-6 h-6" />
			</div>
		</div>
		<div class="flex flex-col gap-4 justify-around px-6 h-72">
			<div
				class="text-center font-semibold p-3 border border-yellow-100 rounded-lg flex items-center"
			>
				<Icon icon="mdi:alert-circle" class="w-5 h-5 text-yellow-600 mr-2" />
				<span>Make sure you saved your private key before logging out</span>
			</div>
			<button class="btn btn-accent" on:click={handleLogout}> Log Out </button>
		</div>
	</div>
</div>
