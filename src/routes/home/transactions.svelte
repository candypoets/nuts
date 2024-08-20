<script lang="ts">
	import { formatDate } from 'src/lib';
	import { pendingTokens } from '../../stores/pendingtokens';
	import TokenHistoryRow from 'src/comp/tokens/TokenHistoryRow.svelte';
	import Icon from '@iconify/svelte';
	import { history } from 'src/stores/db';

	$: page = 20;
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

{#if !$history.length && !$pendingTokens.length && !dismiss}
	<div class="bg-info p-4 m-4 rounded-lg">
		<strong>Low balance in your account</strong>
		<div class="text-xs">
			<p>
				Before using <strong>nuts.cash</strong>, please make sure you understand the
				<a class="link" href="https://nutstash.app/#faq" target="_blank"> risks. </a>
			</p>
		</div>
		<div class="text-right gap-4">
			<button class="btn btn-sm btn-ghost" on:click={() => (dismiss = true)}> Dismiss </button>
			<button class="btn btn-sm" on:click={() => (open = true)}> Add Money </button>
		</div>
	</div>
{:else}
	<div class="w-full">
		<div class="flex flex-col w-full h-full justify-start">
			<div class="w-full">
				{#each Object.entries(map) as [date, items]}
					<strong class="text-xs px-4 pt-4">{date}</strong>
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
		<!-- {#if activeTab === 'tokens'}
			<div class="flex flex-col w-full h-full justify-start">
				<AvailableTokensTable />
			</div>
		{/if} -->
		<!-- {#if $useNostr}
			{#if activeTab === 'inbox'}
				<div class="flex flex-col w-full h-full justify-start">
					<InboxTable />
				</div>
			{/if}
		{/if} -->
	</div>
{/if}
