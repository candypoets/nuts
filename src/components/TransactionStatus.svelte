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
			<!-- Idle - Peanut/Ready (The Alien) -->
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
			<!-- Processing - Alien Abduction Beam -->
			<svg viewBox="0 0 100 100" class="w-full h-full" in:fade={{ duration: 300 }}>
				<!-- UFO body -->
				<g class="origin-center animate-[hover_2s_ease-in-out_infinite]">
					<!-- Dome -->
					<ellipse cx="50" cy="32" rx="12" ry="10" fill="currentColor" class="text-primary/40" />
					<!-- Main saucer -->
					<ellipse cx="50" cy="40" rx="28" ry="10" fill="currentColor" class="text-primary" />
					<!-- Lights around saucer (animated) -->
					<circle cx="28" cy="40" r="3" fill="currentColor" class="text-primary-content animate-[blink_0.6s_ease-in-out_infinite]" />
					<circle cx="39" cy="46" r="3" fill="currentColor" class="text-primary-content animate-[blink_0.6s_ease-in-out_0.2s_infinite]" />
					<circle cx="50" cy="48" r="3" fill="currentColor" class="text-primary-content animate-[blink_0.6s_ease-in-out_0.4s_infinite]" />
					<circle cx="61" cy="46" r="3" fill="currentColor" class="text-primary-content animate-[blink_0.6s_ease-in-out_0.2s_infinite]" />
					<circle cx="72" cy="40" r="3" fill="currentColor" class="text-primary-content animate-[blink_0.6s_ease-in-out_infinite]" />
				</g>
				<!-- Abduction beam -->
				<path
					d="M30 42 L20 85 L80 85 L70 42 Z"
					fill="url(#beamGradient)"
					class="animate-[beamPulse_1s_ease-in-out_infinite]"
				/>
				<!-- Floating peanuts in beam -->
				<g class="animate[floatUp_1.5s_ease-in-out_infinite]">
					<ellipse cx="45" cy="70" rx="4" ry="6" fill="currentColor" class="text-warning" transform="rotate(-15 45 70)" />
					<ellipse cx="48" cy="68" rx="3" ry="5" fill="currentColor" class="text-warning" transform="rotate(10 48 68)" />
				</g>
				<g class="animate-[floatUp_1.5s_ease-in-out_0.5s_infinite]">
					<ellipse cx="58" cy="75" rx="3" ry="5" fill="currentColor" class="text-warning" transform="rotate(20 58 75)" />
					<ellipse cx="55" cy="73" rx="2.5" ry="4" fill="currentColor" class="text-warning" transform="rotate(-10 55 73)" />
				</g>
				<!-- Beam gradient definition -->
				<defs>
					<linearGradient id="beamGradient" x1="0%" y1="0%" x2="0%" y2="100%">
						<stop offset="0%" stop-color="currentColor" stop-opacity="0.5" class="text-primary" />
						<stop offset="100%" stop-color="currentColor" stop-opacity="0" class="text-primary" />
					</linearGradient>
				</defs>
			</svg>
		{:else if state === 'success'}
			<!-- Success - Alien Victory/Celebration -->
			<svg viewBox="0 0 100 100" class="w-full h-full" in:fade={{ duration: 300 }}>
				<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" class="text-success/30" />
				<!-- Happy alien face -->
				<g class="origin-center animate-[bounceIn_0.6s_ease-out_forwards]">
					<!-- Head -->
					<ellipse cx="50" cy="45" rx="22" ry="18" fill="currentColor" class="text-success" />
					<!-- Eyes (big and happy) -->
					<ellipse cx="43" cy="42" rx="5" ry="7" fill="currentColor" class="text-success-content animate-[happyWink_2s_ease-in-out_infinite]" />
					<ellipse cx="57" cy="42" rx="5" ry="7" fill="currentColor" class="text-success-content" />
					<!-- Eye shine -->
					<circle cx="44.5" cy="39.5" r="2" fill="white" opacity="0.8" />
					<circle cx="58.5" cy="39.5" r="2" fill="white" opacity="0.8" />
					<!-- Smile -->
					<path
						d="M40 52 Q50 60 60 52"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						class="text-success-content"
					/>
					<!-- Antenna -->
					<line x1="50" y1="27" x2="50" y2="18" stroke="currentColor" stroke-width="2" class="text-success" />
					<circle cx="50" cy="15" r="4" fill="currentColor" class="text-success animate-[glow_1.5s_ease-in-out_infinite]" />
				</g>
				<!-- Celebration sparkles -->
				<g class="origin-center animate-[sparkle_1s_ease-out_forwards]">
					<path d="M20 25 L22 30 L27 32 L22 34 L20 39 L18 34 L13 32 L18 30 Z" fill="currentColor" class="text-warning" />
					<path d="M75 20 L76.5 23.5 L80 25 L76.5 26.5 L75 30 L73.5 26.5 L70 25 L73.5 23.5 Z" fill="currentColor" class="text-primary" />
					<path d="M82 60 L83 62.5 L85.5 63.5 L83 64.5 L82 67 L81 64.5 L78.5 63.5 L81 62.5 Z" fill="currentColor" class="text-secondary" />
				</g>
			</svg>
		{:else if state === 'failed'}
			<!-- Failed - Sad Alien -->
			<svg viewBox="0 0 100 100" class="w-full h-full" in:fade={{ duration: 300 }}>
				<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" class="text-error/30" />
				<!-- Sad alien face with shake -->
				<g class="origin-center animate-[shake_0.5s_ease-in-out]">
					<!-- Head -->
					<ellipse cx="50" cy="48" rx="22" ry="18" fill="currentColor" class="text-error" />
					<!-- Eyes (droopy) -->
					<ellipse cx="43" cy="46" rx="5" ry="5" fill="currentColor" class="text-error-content" />
					<ellipse cx="57" cy="46" rx="5" ry="5" fill="currentColor" class="text-error-content" />
					<!-- Small pupils looking down -->
					<circle cx="43" cy="47" r="2" fill="currentColor" class="text-error" />
					<circle cx="57" cy="47" r="2" fill="currentColor" class="text-error" />
					<!-- Sad mouth -->
					<path
						d="M42 58 Q50 52 58 58"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						class="text-error-content"
					/>
					<!-- Droopy antenna -->
					<path d="M50 30 Q50 22 56 18" fill="none" stroke="currentColor" stroke-width="2" class="text-error" />
					<circle cx="56" cy="18" r="3" fill="currentColor" class="text-error/60" />
					<!-- Tear -->
					<circle cx="38" cy="50" r="2.5" fill="currentColor" class="text-info animate-[tearDrop_1.5s_ease-in-out_infinite]" />
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

	/* New alien-themed animations */
	@keyframes hover {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-4px); }
	}

	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}

	@keyframes beamPulse {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 0.9; }
	}

	@keyframes floatUp {
		0% { transform: translateY(0) rotate(0deg); opacity: 0; }
		20% { opacity: 1; }
		80% { opacity: 1; }
		100% { transform: translateY(-25px) rotate(10deg); opacity: 0; }
	}

	@keyframes bounceIn {
		0% { transform: scale(0.3); opacity: 0; }
		50% { transform: scale(1.1); }
		70% { transform: scale(0.9); }
		100% { transform: scale(1); opacity: 1; }
	}

	@keyframes happyWink {
		0%, 45%, 55%, 100% { transform: scaleY(1); }
		50% { transform: scaleY(0.1); }
	}

	@keyframes glow {
		0%, 100% { filter: brightness(1); }
		50% { filter: brightness(1.4); }
	}

	@keyframes sparkle {
		0% { transform: scale(0) rotate(0deg); opacity: 0; }
		50% { transform: scale(1.2) rotate(180deg); opacity: 1; }
		100% { transform: scale(1) rotate(360deg); opacity: 1; }
	}

	@keyframes tearDrop {
		0% { transform: translateY(0); opacity: 1; }
		70% { opacity: 1; }
		100% { transform: translateY(15px); opacity: 0; }
	}
</style>
