<script lang="ts">
	import { decode } from '@gandlaf21/bolt11-decode';
	import Icon from '@iconify/svelte';

	import Layer from 'src/comp/drawers/Layer.svelte';

	export let invoice: string;

	export let open = false;

	$: decoded = invoice && decode(invoice);

	// $:
	$: console.log(decoded);
</script>

<Layer bind:open>
	<div class="px-4">
		<div on:click={() => (open = false)}>
			<Icon icon="mdi:close" class="w-6 h-6" />
		</div>
	</div>
	<div class="mobile-height flex flex-col justify-around">
		<div class="text-center">
			<strong class="text-5xl"
				>{decoded?.sections?.find((s) => s.name == 'amount')?.value / 1000 || '0'}</strong
			>Sats
			<br />
			<br />
			<p class="text-xs">
				{decoded?.sections?.find((s) => s.name == 'description')?.value || 'No description'}
			</p>
		</div>
		<div class="flex flex-col gap-4 items-center">
			<button class="btn btn-primary btn-wide">Pay Invoice</button>
		</div>
	</div>
</Layer>
