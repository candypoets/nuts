<script lang="ts">
	import { decode } from '@gandlaf21/bolt11-decode';
	import Icon from '@iconify/svelte';
	import { goBack } from 'src/routes/modals/modal';

	export let invoice: string;

	export let open = false;

	// Handle decoded invoice type
	type DecodedInvoice =
		| {
				paymentRequest: string;
				sections: Array<{ name: string; value: any }>;
				readonly expiry: any;
				readonly route_hints: any[];
		  }
		| '';

	$: decoded = invoice ? (decode(invoice) as DecodedInvoice) : '';
</script>

<div class="px-4">
	<button
		on:click|stopPropagation={goBack}
		on:keydown={(e) => e.key === 'Enter' && (open = false)}
		class="btn btn-ghost p-1"
	>
		<Icon icon="mdi:close" class="w-6 h-6" />
	</button>
</div>
<div class="mobile-height flex flex-col justify-around">
	<div class="text-center">
		<strong class="text-5xl"
			>{typeof decoded !== 'string' && decoded.sections
				? decoded.sections.find((s) => s.name == 'amount')?.value / 1000 || '0'
				: '0'}</strong
		>Sats
		<br />
		<br />
		<p class="text-xs">
			{typeof decoded !== 'string' && decoded.sections
				? decoded.sections.find((s) => s.name == 'description')?.value || 'No description'
				: 'No description'}
		</p>
	</div>
	<div class="flex flex-col gap-4 items-center">
		<button class="btn btn-primary btn-wide">Pay Invoice</button>
	</div>
</div>
