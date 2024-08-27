<script lang="ts">
	import { formatDate } from 'src/lib';
	import { pendingTokens } from '../../stores/pendingtokens';
	import TokenHistoryRow from 'src/comp/tokens/TokenHistoryRow.svelte';
	import Icon from '@iconify/svelte';
	import { history } from 'src/stores/db';

	$: page = 40;
	$: historySub = $history.slice(0, page);

	const loadMore = () => {
		page += 20;
	};

	$: map = historySub?.reduce(
		(acc, item) => {
			// acc += item.amount;
			const d = formatDate(new Date(item.date * 1000));
			acc[d] = acc[d]?.length ? [...acc[d], item] : [item];
			return acc;
		},
		{} as Record<string, any>
	);

	$: console.log($history);
	$: open = false;
	let selected = null;
	let dismiss = false;
</script>

<div class="center-content">
	<div class="w-full md:w-1/2 lg:w-1/3 place-content-center">
		<div class="flex flex-col h-full">
			<div class="w-full">
				{#each Object.entries(map) as [date, items]}
					<strong class="text-sm px-4 pt-4">{date}</strong>
					<div class="mx-4 mt-2 rounded-lg border mb-4">
						<table class="table table-compact w-full">
							<tbody class="max-h-1 overflow-y-scroll scrollbar-hide">
								{#each items as item}
									<TokenHistoryRow {item} />
								{/each}
								<!-- svelte-ignore a11y-click-events-have-key-events -->
							</tbody>
						</table>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.center-content {
		display: flex;
		justify-content: center;
	}
</style>
