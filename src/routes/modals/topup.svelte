<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getContext } from 'svelte';
	import { go } from 'src/routes/modals/modal';

	let animator = getContext('animator');
</script>

<div class="h-full lg:py-8 pt-4">
	<div class="bg-base-300 lg:border lg:rounded-xl h-full">
		<div class="p-4">
			<div on:click={animator.goBack}>
				<Icon icon="mdi:close" class="w-6 h-6" />
			</div>
		</div>
		<div class="p-4">
			<h2 class="text-xl font-bold">Add Money</h2>
			<div class="my-4 rounded-lg border">
				<div class="flex items-center justify-around py-2 border-b" on:click={() => go('minting')}>
					<Icon icon="carbon:lightning" class="w-6 h-6" />
					<div>
						<strong>Add money instantly</strong>
						<p class="text-xs">Top up with lightning</p>
					</div>
					<Icon icon="carbon:arrow-right" class="w-6 h-6" />
				</div>

				<div class="flex items-center justify-around py-2 border-b opacity-40">
					<Icon icon="carbon:user" class="w-6 h-6" />
					<div>
						<strong>Request from friends</strong>
						<p class="text-xs">Instant with zap</p>
					</div>
					<Icon icon="carbon:arrow-right" class="w-6 h-6" />
				</div>
				<div class="flex items-center justify-around py-2 opacity-40">
					<Icon icon="carbon:qr-code" class="w-6 h-6" />
					<div>
						<strong>Request via QR code</strong>
						<p class="text-xs">For easy or offline transfer</p>
					</div>
					<Icon icon="carbon:arrow-right" class="w-6 h-6" />
				</div>
			</div>
		</div>
	</div>
</div>
