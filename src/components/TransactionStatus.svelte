<script lang="ts">
	import { fly, fade } from 'svelte/transition';

	export type TransactionState = 'idle' | 'processing' | 'success' | 'failed';

	export let state: TransactionState = 'idle';
	export let message: string = '';
	export let progress: number = 0; // 0-1 for progress indicator
</script>

<div class="flex flex-col items-center justify-center gap-4 py-8">
	<!-- Animated SVG Icon -->
	<div class="w-24 h-24 relative">
		{#if state === 'idle'}
			<!-- Idle - Peanut/Ready -->
			<svg viewBox="0 0 100 100" class="w-full h-full" in:fade={{ duration: 300 }}>
				<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" class="text-base-content/30" />
				<g class="origin-center">
					<circle cx="50" cy="50" r="25" fill="currentColor" class="text-warning" />
					<!-- Peanut shape -->
					<ellipse cx="40" cy="45" rx="8" ry="12" fill="currentColor" class="text-warning-content" transform="rotate(-20 40 45)" />
					<ellipse cx="60" cy="45" rx="8" ry="12" fill="currentColor" class="text-warning-content" transform="rotate(20 60 45)" />
				</g>
			</svg>
		{:else if state === 'processing'}
			<!-- Processing - Animated Lightning/Spin -->
			<svg viewBox="0 0 100 100" class="w-full h-full" in:fade={{ duration: 300 }}>
				<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" class="text-primary/30" />
				<!-- Rotating ring -->
				<circle
					cx="50"
					cy="50"
					r="35"
					fill="none"
					stroke="currentColor"
					stroke-width="4"
					stroke-dasharray="20 10"
					class="text-primary origin-center animate-[spin_1s_linear_infinite]"
				/>
				<!-- Lightning bolt -->
				<path
					d="M55 25 L45 50 L55 50 L50 75 L65 45 L55 45 Z"
					fill="currentColor"
					class="text-primary animate-[pulse_0.5s_ease-in-out_infinite]"
				/>
			</svg>
		{:else if state === 'success'}
			<!-- Success - Animated Checkmark -->
			<svg viewBox="0 0 100 100" class="w-full h-full" in:fade={{ duration: 300 }}>
				<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" class="text-success/30" />
				<!-- Checkmark with draw animation -->
				<path
					d="M30 50 L45 65 L70 35"
					fill="none"
					stroke="currentColor"
					stroke-width="6"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-success origin-center animate-[drawCheck_0.5s_ease-out_forwards]"
				/>
				<!-- Success burst -->
				<g class="origin-center animate-[burst_0.6s_ease-out_forwards]">
					<line x1="50" y1="10" x2="50" y2="5" stroke="currentColor" stroke-width="3" class="text-success opacity-0" />
					<line x1="50" y1="90" x2="50" y2="95" stroke="currentColor" stroke-width="3" class="text-success opacity-0" />
					<line x1="10" y1="50" x2="5" y2="50" stroke="currentColor" stroke-width="3" class="text-success opacity-0" />
					<line x1="90" y1="50" x2="95" y2="50" stroke="currentColor" stroke-width="3" class="text-success opacity-0" />
				</g>
			</svg>
		{:else if state === 'failed'}
			<!-- Failed - Animated X -->
			<svg viewBox="0 0 100 100" class="w-full h-full" in:fade={{ duration: 300 }}>
				<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" class="text-error/30" />
				<!-- X mark with draw animation -->
				<path
					d="M35 35 L65 65 M65 35 L35 65"
					fill="none"
					stroke="currentColor"
					stroke-width="6"
					stroke-linecap="round"
					class="text-error origin-center animate-[drawX_0.4s_ease-out_forwards]"
				/>
				<!-- Shake animation -->
				<g class="origin-center animate-[shake_0.5s_ease-in-out]">
					<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="3" class="text-error" opacity="0.3" />
				</g>
			</svg>
		{/if}
	</div>

	<!-- Message Text -->
	{#if message}
		<div class="text-center" in:fly={{ y: 10, duration: 300 }}>
			<p class="text-lg font-medium text-base-content">{message}</p>
		</div>
	{/if}

	<!-- Progress Bar (when processing) -->
	{#if state === 'processing' && progress > 0}
		<div class="w-64 h-2 bg-base-content/20 rounded-full overflow-hidden" in:fade={{ duration: 200 }}>
			<div
				class="h-full bg-primary transition-all duration-300 ease-out rounded-full"
				style="width: {progress * 100}%"
			/>
		</div>
	{/if}
</div>

<style>
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.7; transform: scale(0.95); }
	}

	@keyframes drawCheck {
		0% { stroke-dasharray: 0 200; stroke-dashoffset: 0; }
		100% { stroke-dasharray: 100 200; stroke-dashoffset: 0; }
	}

	@keyframes drawX {
		0% { stroke-dasharray: 0 100; stroke-dashoffset: 0; }
		100% { stroke-dasharray: 100 100; stroke-dashoffset: 0; }
	}

	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		20% { transform: translateX(-5px); }
		40% { transform: translateX(5px); }
		60% { transform: translateX(-5px); }
		80% { transform: translateX(5px); }
	}

	@keyframes burst {
		0% { transform: scale(0.8); opacity: 0; }
		50% { opacity: 1; }
		100% { transform: scale(1.2); opacity: 0; }
	}
</style>
