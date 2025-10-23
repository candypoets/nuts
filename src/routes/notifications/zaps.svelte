<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import Icon from '@iconify/svelte';

	export let originalPost: any; // The post that was zapped
	export let zaps: any[] = []; // Array of zap events
	export let timestamp: number = Date.now() / 1000; // Timestamp of most recent zap
	export let expanded: boolean = false; // Whether to show all zaps or just a summary

	// Get unique authors who zapped
	$: uniqueAuthors = [...new Set(zaps.map((zap) => zap.pubkey))];

	// Calculate total zap amount
	$: totalAmount = zaps.reduce((sum, zap) => sum + (zap.amount || 0), 0);

	function toggleExpanded() {
		expanded = !expanded;
	}

	function formatTime(timestamp: number): string {
		return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
	}

	function formatSats(amount: number): string {
		if (amount >= 1000000) {
			return (amount / 1000000).toFixed(1) + 'M sats';
		} else if (amount >= 1000) {
			return (amount / 1000).toFixed(1) + 'K sats';
		} else {
			return amount + ' sats';
		}
	}
</script>

<div
	class="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4 hover:bg-gray-50 transition-colors"
>
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="bg-yellow-100 p-2 rounded-full flex-shrink-0">
			<Icon icon="mdi:lightning-bolt" class="text-yellow-600 text-lg" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with zap count and amount -->
			<div class="flex justify-between items-center mb-2">
				<div class="font-medium text-gray-800">
					{uniqueAuthors.length}
					{uniqueAuthors.length === 1 ? 'person' : 'people'} zapped your post
				</div>
				<div class="text-xs text-gray-500">
					{formatTime(timestamp)}
				</div>
			</div>

			<!-- Zap amount highlight -->
			<div class="bg-yellow-50 text-yellow-800 font-bold px-3 py-2 rounded-md inline-block mb-3">
				+{formatSats(totalAmount)}
			</div>

			<!-- Original post summary -->
			<div class="bg-gray-50 p-3 rounded-md mb-3 text-sm text-gray-700 line-clamp-2">
				{originalPost.content}
			</div>

			<!-- Author avatars -->
			<div class="flex -space-x-2 mb-2">
				{#each uniqueAuthors.slice(0, 5) as author}
					<img
						src={author.picture || '/miss-profile.png'}
						alt={author.name || 'User'}
						class="w-8 h-8 rounded-full border-2 border-white"
					/>
				{/each}
				{#if uniqueAuthors.length > 5}
					<div
						class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium border-2 border-white"
					>
						+{uniqueAuthors.length - 5}
					</div>
				{/if}
			</div>

			<!-- Expandable zaps section -->
			{#if expanded}
				<div class="mt-3 border-t pt-3">
					<table class="w-full text-sm">
						<thead class="text-xs text-gray-500">
							<tr>
								<th class="text-left pb-2">User</th>
								<th class="text-right pb-2">Amount</th>
								<th class="text-right pb-2">Time</th>
							</tr>
						</thead>
						<tbody>
							{#each zaps.slice(0, 10) as zap}
								<tr class="border-b border-gray-100 last:border-0">
									<td class="py-2">
										<div class="flex items-center gap-2">
											<img
												src={zap.picture || '/miss-profile.png'}
												alt={zap.name || 'User'}
												class="w-6 h-6 rounded-full"
											/>
											<span>{zap.name || 'User'}</span>
										</div>
									</td>
									<td class="text-right font-medium text-yellow-700">
										{formatSats(zap.amount || 0)}
									</td>
									<td class="text-right text-xs text-gray-500">
										{formatTime(zap.created_at)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>

					{#if zaps.length > 10}
						<div class="text-center mt-2">
							<button class="text-xs text-yellow-600 hover:underline">
								View all {zaps.length} zaps
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Toggle button -->
			<button
				class="mt-2 text-xs text-yellow-600 hover:underline flex items-center gap-1"
				on:click={toggleExpanded}
			>
				{expanded ? 'Show less' : 'Show details'}
				<Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
			</button>
		</div>
	</div>
</div>
