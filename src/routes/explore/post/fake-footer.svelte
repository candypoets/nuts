<script>
	import Icon from '@iconify/svelte';
</script>

{#if biggerZap}
	<div class="flex items-center gap-1 px-10">
		<!-- <Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" /> -->
		<div class="flex items-center gap-2">
			<PictureProfile pubkey={biggerZap.pubkey} />
			{biggerZap.amount / 1000}
		</div>
		<div class="max-w-9">
			{#each $zaps.filter((z) => z.pubkey != biggerZap.pubkey) as zap}
				<PictureProfile pubkey={zap?.pubkey} />
			{/each}
		</div>
	</div>
{/if}
<div class="flex items-center w-full mt-1 border-b pb-1">
	<div class="min-w-8" />
	<div class="flex-grow flex justify-between px-4 opacity-60">
		<div class="flex items-center gap-1">
			<Icon icon="iconamoon:comment-light" class="" />
		</div>
		<div class="flex items-center">
			<Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" />
		</div>
		<div class="flex items-center gap-1">
			<Icon icon="icon-park-outline:like" class="" />
		</div>
		<div class="flex items-center gap-1">
			<Icon icon="grommet-icons:sync" class="" />
		</div>
	</div>
</div>
