<script lang="ts">
	import { fly } from 'svelte/transition';

	// $: if ($alert) {
	// 	setTimeout(() => {
	// 		$alert = '';
	// 	}, 1000);
	// }
</script>

<!-- {#if $alert} -->
<div class="absolute top-20 w-full z-40" transition:fly={{ y: -50, duration: 300 }}>
	<!-- {#if $alert}
			<div class="flex justify-center">
				<div class="bg-primary text-white text-sm py-1 px-2 rounded-lg">
					{$alert}
				</div>
			</div>
		{/if} -->
</div>
<!-- {/if} -->
