<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getContext } from 'svelte';

	export let amount: string = '';
	export let mint: string = '';

	let animator = getContext('animator');
</script>

<div class="h-screen w-feed flex items-end py-8" on:click={() => animator?.goBack()}>
	<div
		class="w-feed flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-xl text-center"
		on:click|stopPropagation
	>
		<!-- Animated Checkmark Icon -->
		<!-- Using Tailwind's bounce animation for a 'satisfying' feel -->
		<div class="p-3 bg-green-100 rounded-full inline-block mb-4 animate-bounce">
			<Icon
				icon="streamline:money-cash-arrow-up-success-payment-cash-up-arrow"
				class="w-12 h-12 text-green-600"
			/>
		</div>

		<!-- Success Title -->
		<h3 class="text-2xl font-bold text-gray-800 mb-2">Mint Successful!</h3>

		<!-- Success Message -->
		<p class="text-gray-600 text-lg">
			<strong class="font-semibold text-green-700">{amount}</strong> sats fresh off
			<strong class="font-semibold text-blue-600">{mint}</strong>!
		</p>
	</div>
</div>
