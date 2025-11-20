<script>
	import Icon from '@iconify/svelte';
	import _, { uniqBy } from 'lodash';
	import { getContext, onMount, tick } from 'svelte';

	// props
	export let items;
	export let height = '100%';
	export let itemHeight = undefined;
	export let className = '';

	export let getItemId;
	export let backdrop;
	export let loading;
	export let itemsPerRow = 1;

	// Optional Pull-to-Refresh (native rubber-band; we only detect)
	export let pullToRefresh = false;
	export let onRefresh = undefined; // () => void | Promise<void>
	export let refreshThreshold = 72; // px of vertical pull (raw) required to trigger
	export let pullDampen = 0.5; // indicator progress damping (visual only)
	export let maxPull = 120; // cap for indicator progress
	export let slop = 8; // px before gesture lock (H vs V)

	// read-only, but visible to consumers via bind:start
	export let start = 0;
	export let end = 0;

	// local state
	let height_map = [];
	let rows;
	export let viewport;
	let contents;
	let viewport_height = 0;
	let visible;
	let mounted;

	export let top = 0;
	let bottom = 0;
	let average_height;

	// pull-to-refresh state (no transforms; just measure)
	let ptrArmed = false; // true when at top and eligible to start pulling
	let pulling = false; // true when we've locked on a vertical pull from top
	let isRefreshing = false;
	let pullStartY = 0;
	let pullStartX = 0;
	let gesture = 'unknown'; // 'unknown' | 'vertical' | 'horizontal'
	let pullY = 0; // raw measured pull distance in px (not used to transform)

	$: rowCount = Math.ceil((items?.length || 0) / itemsPerRow);
	$: rowsData = Array.from({ length: rowCount }, (_, i) =>
		items.slice(i * itemsPerRow, (i + 1) * itemsPerRow)
	);

	$: rowIds = rowsData.map((row) =>
		itemsPerRow === 1 ? getItemId(row[0]) : row.map(getItemId).join('-')
	);

	$: visible = rowsData.slice(0, end).map((data, i) => {
		return { index: i + start, data }; // data is an array of items for the row
	});

	// whenever `items` changes, invalidate the current heightmap
	$: if (mounted && items.length > 0) refresh(items, viewport_height, itemHeight);

	const isImageContext = getContext('imageContext');
	const isModalContext = getContext('modal');

	async function refresh(items, viewport_height, itemHeight) {
		const { scrollTop } = viewport;

		await tick(); // wait until the DOM is up to date

		let content_height = top - scrollTop;
		let i = start;

		const totalRows = Math.ceil(items.length / itemsPerRow);

		while (content_height < viewport_height && i < totalRows) {
			let row = rows[i - start];
			if (!row) {
				end = i + 1;
				await tick(); // render the newly visible row
				row = rows[i - start];
			}
			const row_height = (height_map[rowIds[i - start]] = itemHeight || row?.offsetHeight) || 200;
			content_height += row_height;
			i += 1;
		}

		end = i;

		const remaining = totalRows - end;
		average_height = (top + content_height) / (end || 1);

		bottom = remaining * average_height;
		height_map.length = totalRows || 0;
	}

	let lastScrollTop = 0;
	export let down = true;

	async function handle_scroll() {
		const { scrollTop } = viewport;

		// Track scroll direction based on scroll position change
		down = scrollTop > lastScrollTop;
		lastScrollTop = down ? scrollTop - 5 : scrollTop + 5;

		for (let v = 0; v < rows.length; v += 1) {
			const row = rows[v];

			height_map[rowIds[v]] = itemHeight || rows[v].offsetHeight;
		}

		const totalRows = Math.ceil(items.length / itemsPerRow);

		let i = 0;
		let y = 0;

		while (i < totalRows) {
			const row_height = height_map[rowIds[i]] || average_height;
			if (y + row_height > scrollTop) {
				start = i;
				top = y;
				break;
			}

			y += row_height;
			i += 1;
		}
		while (i < totalRows) {
			y += height_map[rowIds[i]] || average_height;
			i += 1;

			if (y > scrollTop + viewport_height * 2) break;
		}
		end = i;

		const remaining = totalRows - end;
		average_height = y / (end || 1);

		while (i < totalRows) height_map[rowIds[i++]] = average_height;
		bottom = remaining * average_height;
	}

	function handleTouchStart(event) {
		// Always track for gesture detection
		pullStartY = event.touches[0].clientY;
		pullStartX = event.touches[0].clientX;
		gesture = 'unknown';
		pullY = 0;
		pulling = false;

		// Arm PTR if we're eligible (at top, not already refreshing)
		ptrArmed = !!pullToRefresh && viewport && viewport.scrollTop <= 0 && !isRefreshing;
	}

	function handleTouchMove(event) {
		const touchCurrentY = event.touches[0].clientY;
		const touchCurrentX = event.touches[0].clientX;

		const dx = touchCurrentX - pullStartX;
		const dy = touchCurrentY - pullStartY;

		const absX = Math.abs(dx);
		const absY = Math.abs(dy);

		// Decide gesture after small slop
		if (gesture === 'unknown' && (absX > slop || absY > slop)) {
			gesture = absX > absY ? 'horizontal' : 'vertical';
		}

		// Horizontal swipe wins: never engage PTR
		if (gesture === 'horizontal') {
			pulling = false;
			ptrArmed = false;
			pullY = 0;
			return;
		}

		// Vertical: if armed, measure the pull (no preventDefault; keep native rubber-band)
		if (gesture === 'vertical' && ptrArmed) {
			// only measure downward pull from the top
			if (dy > 0 && viewport && viewport.scrollTop <= 0) {
				pulling = true;
				pullY = dy;
				// do NOT preventDefault here — let the browser do native overscroll
				return;
			} else {
				// user moved up or left top; disarm
				pulling = false;
				ptrArmed = false;
				pullY = 0;
			}
		}

		// Existing behavior: stop propagation for strong vertical scroll when not at top
		const isYAxisGesture = absY > absX && absY > 10;
		if (isYAxisGesture) {
			// Only stop propagation if we're not at the top of the scroll
			if (viewport && viewport.scrollTop > 0) {
				event.stopPropagation();
			}
		}
	}

	async function handleTouchEnd() {
		// Snapshot state
		const wasPulling = pulling;
		const pulledEnough = wasPulling && pullY >= refreshThreshold;

		// Reset gesture/pull state
		pulling = false;
		ptrArmed = false;
		gesture = 'unknown';

		if (pullToRefresh && pulledEnough && !isRefreshing && typeof onRefresh === 'function') {
			isRefreshing = true;
			try {
				await onRefresh();
			} finally {
				isRefreshing = false;
				pullY = 0;
			}
		} else {
			pullY = 0;
		}
	}

	function handleTouchCancel() {
		pulling = false;
		ptrArmed = false;
		gesture = 'unknown';
		pullY = 0;
	}

	// trigger initial refresh
	onMount(() => {
		rows = contents.getElementsByTagName('svelte-virtual-list-row');
		mounted = true;
	});
</script>

<svelte-virtual-list-viewport
	bind:this={viewport}
	bind:offsetHeight={viewport_height}
	on:scroll={handle_scroll}
	class={'max-h-screen overscroll-y-contain touch-auto ' + (className || '')}
	style="height: {height}; position: relative;"
	on:touchstart={handleTouchStart}
	on:touchmove={handleTouchMove}
	on:touchend={handleTouchEnd}
	on:touchcancel={handleTouchCancel}
>
	{#if pullToRefresh}
		<!-- Overlay indicator (visual only; does not affect layout or virtualization) -->
		<div class="absolute top-0 left-0 right-0 z-20 flex justify-center pointer-events-none">
			<div
				class="mt-2 flex items-center gap-2 text-sm text-slate-400 select-none transition-opacity duration-150 ease-out"
				style="opacity: {isRefreshing || pulling ? 1 : 0};"
			>
				<svg
					class={'w-4 h-4 ' + (isRefreshing ? 'animate-spin' : '')}
					viewBox="0 0 24 24"
					fill="none"
				>
					<circle
						cx="12"
						cy="12"
						r="9"
						stroke="currentColor"
						stroke-opacity="0.25"
						stroke-width="3"
					/>
					<path
						d="M21 12a9 9 0 0 0-9-9"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
					/>
				</svg>
				<span>
					{#if isRefreshing}
						Refreshing…
					{:else if pulling}
						{Math.min(pullY * pullDampen, maxPull) < refreshThreshold
							? 'Pull to refresh'
							: 'Release to refresh'}
					{/if}
				</span>
			</div>
		</div>
	{/if}

	<svelte-virtual-list-contents
		bind:this={contents}
		style="top: {top}px; padding-bottom: {bottom > 100 ? bottom : 100}px;"
		class:!w-full={isImageContext || isModalContext}
		class="w-feed mx-auto rounded-xl isolate"
	>
		<svelte-virtual-list-row>
			<slot name="feed-header" />
		</svelte-virtual-list-row>

		{#each visible as row, index (itemsPerRow === 1 ? getItemId(row.data[0]) : row.data
					.map(getItemId)
					.join('-'))}
			<svelte-virtual-list-row>
				<!-- Always provide both: item (first) and items (array) -->
				<slot item={row.data[0]} items={row.data} itemIndex={index}>Missing template</slot>
			</svelte-virtual-list-row>
		{:else}
			<slot name="empty-content" />
		{/each}

		{#if loading}
			<div class="flex justify-center items-center w-full h-20">
				<Icon icon="ei:spinner" class="animate-spin w-8 h-8" />
			</div>
		{/if}
	</svelte-virtual-list-contents>
</svelte-virtual-list-viewport>

<style>
	svelte-virtual-list-viewport {
		position: relative; /* for overlay */
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		display: block;
	}

	svelte-virtual-list-contents,
	svelte-virtual-list-row {
		display: block;
	}

	svelte-virtual-list-row {
		overflow: hidden;
	}
</style>
