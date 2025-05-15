<script>
	import { debug } from 'src/controller/debug';

	let visible = true;

	function toggleVisibility() {
		visible = !visible;
	}
</script>

{#if visible}
	<div
		class="fixed bottom-4 left-4 w-56 bg-base-200 rounded-lg shadow-lg border border-base-300 overflow-hidden z-50"
	>
		<div class="p-3 bg-base-300 flex justify-between items-center">
			<h3 class="text-sm font-semibold">Debug Metrics</h3>
			<button class="btn btn-xs btn-ghost" on:click={toggleVisibility}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3 w-3"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
		<div class="p-3">
			<div class="flex flex-col gap-1">
				<div class="flex justify-between items-center text-xs">
					<span class="text-info">Goroutines:</span>
					<span class="font-mono">{$debug.goroutines}</span>
				</div>
				<div class="flex justify-between items-center text-xs">
					<span class="text-warning">CPU Usage:</span>
					<span class="font-mono">{$debug.cpu}</span>
				</div>
				<div class="flex justify-between items-center text-xs">
					<span class="text-success">Active Subscriptions:</span>
					<span class="font-mono">{$debug.subscriptions}</span>
				</div>
			</div>
		</div>
	</div>
{:else}
	<button
		class="fixed bottom-4 left-4 btn btn-sm btn-circle btn-primary cursor-pointer z-10"
		on:click={toggleVisibility}
		title="Show Debug Metrics"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	</button>
{/if}
