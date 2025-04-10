<script lang="ts">
	import { formatDate } from 'src/lib';
	import Row from './Row.svelte';
	import Transaction from './Transaction.svelte';

	import { history } from 'src/stores/db';
	import VirtualList from 'src/comp/VirtualList.svelte';

	export let top;

	$: map = $history?.reduce(
		(acc, item) => {
			// acc += item.amount;
			const d = formatDate(new Date(item.date * 1000));
			acc[d] = acc[d]?.length ? [...acc[d], item] : [item];
			return acc;
		},
		{} as Record<string, any>
	);

	$: open = false;
	let dismiss = false;
	$: items = Object.entries(map).reduce((acc, cur) => [...(acc || []), cur[0], ...map[cur[0]]], []);
</script>

<!-- {#if !$history.length && !dismiss}
	<div class="bg-info lg:w-1/3 lg:m-auto p-4 m-4 rounded-lg">
		<strong>Low balance in your account</strong>
		<div class="text-xs">
			<p>Be careful out there, nuts.cash is a beta software and you might lose your money.</p>
		</div>
		<div class="text-right gap-4">
			<button class="btn btn-sm btn-ghost" on:click={() => (dismiss = true)}> Dismiss </button>
			<button class="btn btn-sm" on:click={() => (open = true)}> Add Money </button>
		</div>
	</div>
{:else} -->
<div class="w-full m-auto">
	<VirtualList {items} bind:top let:item getItemId={(item) => item.date || item}>
		<Transaction {item} />
	</VirtualList>
	<!-- {#each Object.entries(map) as [date, items]}
					<strong class="text-sm px-4 pt-4">{date}</strong>
					<div class="mx-4 mt-2 rounded-lg border mb-4">
						<table class="table table-compact w-full">
							<tbody class="max-h-1 overflow-y-scroll scrollbar-hide">
								{#each items as item}
									<Row {item} />
								{/each}
							</tbody>
						</table>
					</div>
				{/each} -->
</div>

<!-- {/if} -->

<style>
	.home-height {
		height: calc(var(--vc, 1vh) * 100 - 22rem - env(safe-area-inset-top));
	}
</style>
