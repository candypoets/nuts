<script lang="ts">
	import Icon from '@iconify/svelte';

	export let amount: string = '';
	export let mint: string = ''; // Represents the mint URL or identifier from which tokens were sent/melted
</script>

<div class="h-screen w-feed flex items-end py-8">
	<div
		class="w-feed flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-xl text-center"
	>
		<!-- Animated Send/Success Icon -->
		<!-- Using Tailwind's bounce animation for a 'satisfying' feel -->
		<div class="p-3 bg-green-100 rounded-full inline-block mb-4 animate-bounce">
			<Icon
				icon="streamline:money-cash-arrow-down-transfer-payment-cash-down-arrow"
				class="w-12 h-12 text-green-600"
			/>
		</div>

		<!-- Success Title -->
		<h3 class="text-2xl font-bold text-gray-800 mb-2">Send Successful!</h3>

		<!-- Success Message -->
		<p class="text-gray-600 text-lg">
			<strong class="font-semibold text-green-700">{amount}</strong> sats sent from
			<strong class="font-semibold text-blue-600">{mint}</strong>!
		</p>
	</div>
</div>
