<script lang="ts">
	import { CircleAlert, Loader2, RotateCcw } from 'lucide-svelte';

	export let phase: 'publishing' | 'failed';
	export let message = '';
	export let onRetry: () => void;
</script>

<div
	class={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${
		phase === 'failed'
			? 'border-rose-200 bg-rose-50 text-rose-900'
			: 'border-amber-200 bg-amber-50 text-amber-900'
	}`}
>
	<div class="flex min-w-0 flex-1 items-start gap-3">
		{#if phase === 'failed'}
			<CircleAlert size={18} class="mt-0.5 shrink-0" />
		{:else}
			<Loader2 size={18} class="mt-0.5 shrink-0 animate-spin" />
		{/if}
		<div class="min-w-0">
			<p class="text-sm font-black">
				{phase === 'failed' ? 'Not confirmed by the relay' : message || 'Publishing to the relay…'}
			</p>
			{#if phase === 'failed'}
				<p class="mt-0.5 text-xs font-semibold leading-5 text-rose-700">
					{message || 'This item is only shown optimistically.'}
				</p>
			{/if}
		</div>
	</div>
	{#if phase === 'failed'}
		<button
			type="button"
			class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-rose-800 px-3 text-xs font-black text-white transition hover:bg-rose-900"
			on:click|stopPropagation={onRetry}
		>
			<RotateCcw size={14} /> Publish again
		</button>
	{/if}
</div>
