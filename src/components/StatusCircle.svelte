<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { spring, tweened } from 'svelte/motion';
	import { PublishStatus } from 'src/model/nostr-main';
	import { cubicOut } from 'svelte/easing';

	// Component props
	export let relayName = '';
	export let relayImage = null;
	export let status: PublishStatus = PublishStatus.StatusPending;
	export let progress = 0; // 0 to 1
	export let errorMessage = '';
	export let eventData = {};
	export let size = 20; // Size in pixels

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Animation values
	const scale = spring(0, {
		stiffness: 0.2,
		damping: 0.4
	});

	const opacity = spring(0, {
		stiffness: 0.2,
		damping: 0.7
	});

	const progressValue = tweened(0, {
		duration: 600,
		easing: cubicOut
	});

	// State
	let showDetails = false;
	let mounted = false;

	// Status colors
	const colors = {
		[PublishStatus.StatusPending]: '#3498db',
		[PublishStatus.StatusSuccess]: '#10b981',
		[PublishStatus.StatusConnError]: '#ef4444',
		[PublishStatus.StatusFailed]: '#ef4444',
		[PublishStatus.StatusRejected]: '#ef4444'
	};

	// Update progress when prop changes
	$: {
		if (mounted) {
			$progressValue = progress;
		}
	}

	// Update status and progress
	$: {
		if (status) {
			$progressValue = status === PublishStatus.StatusPending ? progress : 1;
		}
	}

	// When component mounts, animate in
	onMount(() => {
		mounted = true;
		scale.set(1);
		opacity.set(1);
		progressValue.set(progress);
	});

	// Calculate the SVG path for the progress arc
	function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
		const start = polarToCartesian(x, y, radius, endAngle);
		const end = polarToCartesian(x, y, radius, startAngle);
		const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

		return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
	}

	function polarToCartesian(
		centerX: number,
		centerY: number,
		radius: number,
		angleInDegrees: number
	) {
		const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
		return {
			x: centerX + radius * Math.cos(angleInRadians),
			y: centerY + radius * Math.sin(angleInRadians)
		};
	}

	function toggleDetails() {
		showDetails = !showDetails;
		dispatch('click', { showDetails, status, errorMessage, eventData });
	}

	// Get first letter of relay name (for fallback)
	$: firstLetter = relayName.charAt(0).toUpperCase();

	// Tailwind classes based on status
	$: statusTextColor = {
		[PublishStatus.StatusSent]: 'text-gray',
		[PublishStatus.StatusPending]: 'text-blue-500',
		[PublishStatus.StatusSuccess]: 'text-green-500',
		[PublishStatus.StatusConnError]: 'text-red-500',
		[PublishStatus.StatusFailed]: 'text-red-500',
		[PublishStatus.StatusRejected]: 'text-red-500'
	}[status];

	const isErrorStatus = status === PublishStatus.StatusFailed ||
		status === PublishStatus.StatusRejected || [PublishStatus.StatusConnError];
</script>

<div class="inline-block relative" style="opacity: {$opacity}; transform: scale({$scale})">
	<!-- {$progressValue} -->
	<svg
		width={size}
		height={size}
		viewBox="0 0 100 100"
		on:click={toggleDetails}
		class="overflow-visible cursor-pointer transition-transform duration-200 ease-in-out {status ===
			PublishStatus.StatusFailed || showDetails
			? 'hover:scale-105'
			: ''}"
	>
		<!-- Background circle -->
		<circle cx="50" cy="50" r="46" fill="none" stroke="#e6e6e6" stroke-width="8" />

		<!-- Progress arc -->
		{#if $progressValue > 0}
			<path
				d={$progressValue >= 0.99
					? describeArc(50, 50, 46, 0, 359.9)
					: describeArc(50, 50, 46, 0, $progressValue * 360)}
				fill="none"
				stroke={colors[status]}
				stroke-width="8"
				stroke-linecap="round"
			/>
		{/if}

		<!-- Center content -->
		<g>
			{#if relayImage}
				<image
					href={relayImage}
					x="25"
					y="25"
					width="50"
					height="50"
					clip-path="circle(25px at center)"
				/>
			{:else}
				<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="40">
					{firstLetter}
				</text>
			{/if}
		</g>
	</svg>

	<!-- Details popup -->
	{#if showDetails}
		<div
			class="card absolute left-1/2 top-1/2 mt-8 ml-4 bg-base-100 shadow-lg w-72 z-50"
			transition:tweened={{ duration: 200 }}
		>
			<div class="card-title bg-base-200 px-4 py-3 flex justify-between items-center">
				<span class="font-bold {statusTextColor} text-sm">{status.toUpperCase()}</span>
				<button
					class="btn btn-ghost btn-xs btn-circle"
					on:click|stopPropagation={() => (showDetails = false)}
				>
					<iconify-icon icon="mdi:close" width="16" height="16"></iconify-icon>
				</button>
			</div>

			{#if isErrorStatus && errorMessage}
				<div class="px-4 py-3 text-error border-b border-base-300">
					{errorMessage}
				</div>
			{/if}

			<div class="card-body p-4 max-h-48 overflow-y-auto">
				{#if Object.keys(eventData).length > 0}
					<pre class="text-xs whitespace-pre-wrap">{JSON.stringify(eventData, null, 2)}</pre>
				{:else}
					<p class="text-base-content/60">No event data available</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
