<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { spring, tweened } from 'svelte/motion';
	import { PublishStatus } from 'src/wasm/manager';
	import { cubicOut } from 'svelte/easing';

	// Component props
	export let relayName = '';
	export let relayImage = null;
	export let status: PublishStatus = PublishStatus.StatusPending;
	export let progress = 0; // 0 to 1
	export let errorMessage = '';
	export let eventData = {};
	export let size = 48; // Size in pixels

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
</script>

<div class="inline-block relative" style="opacity: {$opacity}; transform: scale({$scale})">
	<svg
		width={size}
		height={size}
		viewBox="0 0 100 100"
		on:click={toggleDetails}
		class="overflow-visible cursor-pointer transition-transform duration-200 ease-in-out {status ===
			'error' || showDetails
			? 'hover:scale-105'
			: ''}"
	>
		<!-- Background circle -->
		<circle cx="50" cy="50" r="46" fill="none" stroke="#e6e6e6" stroke-width="8" />

		<!-- Progress arc -->
		{#if $progressValue > 0}
			<path
				d={describeArc(50, 50, 46, 0, $progressValue * 360)}
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
				<text
					x="50"
					y="50"
					text-anchor="middle"
					dominant-baseline="central"
					font-size="40"
					fill={colors[status]}
				>
					{firstLetter}
				</text>
			{/if}
		</g>
	</svg>

	<!-- Details popup -->
	{#if showDetails}
		<div
			class="absolute top-full right-0 mt-3 bg-white rounded-lg shadow-lg w-72 z-50 overflow-hidden"
			transition:tweened={{ duration: 200 }}
		>
			<div class="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
				<span class="font-bold {statusTextColor}">{status.toUpperCase()}</span>
				<button
					class="text-gray-500 hover:text-gray-700 text-xl leading-none"
					on:click|stopPropagation={() => (showDetails = false)}
				>
					×
				</button>
			</div>

			{#if status === 'error' && errorMessage}
				<div class="px-4 py-3 text-red-500 border-b border-gray-200">
					{errorMessage}
				</div>
			{/if}

			<div class="px-4 py-3 max-h-48 overflow-y-auto">
				{#if Object.keys(eventData).length > 0}
					<pre class="text-xs whitespace-pre-wrap">{JSON.stringify(eventData, null, 2)}</pre>
				{:else}
					<p class="text-gray-500">No event data available</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
