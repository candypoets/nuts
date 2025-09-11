<script>
	import _, { uniqBy } from 'lodash';
	import { onMount, tick } from 'svelte';

	// props
	export let items;
	export let height = '100%';
	export let itemHeight = undefined;
	export let className = '';

	export let getItemId;
	export let backdrop;
	export let loading;

	let foo;

	// read-only, but visible to consumers via bind:start
	export let start = 0;
	export let end = 0;

	// local state
	let height_map = [];
	let rows;
	export let viewport;
	let contents;
	let header;
	let viewport_height = 0;
	let visible;
	let mounted;

	export let top = 0;
	let bottom = 0;
	let average_height;

	$: visible = items.slice(0, end).map((data, i) => {
		return { index: i + start, data };
	});

	// whenever `items` changes, invalidate the current heightmap
	$: if (mounted) refresh(items, viewport_height, itemHeight);

	async function refresh(items, viewport_height, itemHeight) {
		const { scrollTop } = viewport;

		await tick(); // wait until the DOM is up to date

		let content_height = top - scrollTop;
		let i = start;

		while (content_height < viewport_height * 2 && i < items.length) {
			let row = rows[i - start];

			if (!row) {
				end = i + 1;
				await tick(); // render the newly visible row
				row = rows[i - start];
			}

			const row_height = (height_map[i] = itemHeight || row?.offsetHeight) || 200;
			content_height += row_height;
			i += 1;
		}

		end = i;

		const remaining = items.length - end;
		average_height = (top + content_height) / end;

		bottom = remaining * average_height;
		height_map.length = items.length;
	}

	let lastScrollTop = 0;
	let touchStartY = 0;
	let touchStartX = 0;

	export let down = true;

	async function handle_scroll(event) {
		const { scrollTop } = viewport;

		// Track scroll direction based on scroll position change
		down = scrollTop > lastScrollTop;
		lastScrollTop = down ? scrollTop - 5 : scrollTop + 5;

		const old_start = start;

		for (let v = 0; v < rows.length; v += 1) {
			height_map[v] = itemHeight || rows[v].offsetHeight;
		}

		let i = 0;
		let y = 0;

		while (i < items.length) {
			const row_height = height_map[i] || average_height;
			if (y + row_height > scrollTop) {
				start = i;
				top = y;

				break;
			}

			y += row_height;
			i += 1;
		}
		while (i < items.length) {
			y += height_map[i] || average_height;
			i += 1;

			if (y > scrollTop + viewport_height * 2) break;
		}
		end = i;

		const remaining = items.length - end;
		average_height = y / end;

		while (i < items.length) height_map[i++] = average_height;
		bottom = remaining * average_height;

		// viewport.scrollTo(0, y);

		// prevent jumping if we scrolled up into unknown territory
		// if (start < old_start) {
		// 	await tick();

		// 	let expected_height = 0;
		// 	let actual_height = 0;

		// 	for (let i = start; i < old_start; i += 1) {
		// 		if (rows[i - start]) {
		// 			expected_height += height_map[i];
		// 			actual_height += itemHeight || rows[i - start].offsetHeight;
		// 		}
		// 	}

		// 	const d = actual_height - expected_height;
		// 	viewport.scrollTo(0, scrollTop + d);
		// }

		// TODO if we overestimated the space these
		// rows would occupy we may need to add some
		// more. maybe we can just call handle_scroll again?
	}

	function handleTouchStart(event) {
		touchStartY = event.touches[0].clientY;
		touchStartX = event.touches[0].clientX;
	}

	function handleTouchMove(event) {
		const touchCurrentY = event.touches[0].clientY;
		const touchCurrentX = event.touches[0].clientX;

		const deltaY = Math.abs(touchCurrentY - touchStartY);
		const deltaX = Math.abs(touchCurrentX - touchStartX);

		// Check if this is primarily a Y-axis gesture
		const isYAxisGesture = deltaY > deltaX && deltaY > 10;

		if (isYAxisGesture) {
			// Only stop propagation if we're not at the top of the scroll
			if (viewport.scrollTop > 0) {
				event.stopPropagation();
			}
		}
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
	class={'max-h-screen ' + className || ''}
	style="height: {height};"
	on:touchstart={handleTouchStart}
	on:touchmove={handleTouchMove}
>
	<svelte-virtual-list-contents
		bind:this={contents}
		style="top: {top}px; padding-bottom: {bottom > 100 ? bottom : 100}px;"
		class={backdrop &&
			'bg-base-300 bg-opacity-85 w-feed-container mx-auto min-h-screen rounded-xl backdrop-blur-gpu isolate'}
	>
		<svelte-virtual-list-row>
			<slot name="feed-header" />
		</svelte-virtual-list-row>
		{#each visible as row, index (getItemId(row.data))}
			<svelte-virtual-list-row>
				<slot item={row.data} itemIndex={index}>Missing template</slot>
			</svelte-virtual-list-row>
		{/each}
		{#if loading}
			{#each Array(8) as _, index (index)}
				<slot name="loading-item">
					<div class="lg:hover:bg-base-200 rounded-md pt-2 px-1 mb-4 first:pt-16">
						<div class="flex items-center mb-2">
							<div class="w-10 h-10 rounded-full shimmer"></div>
							<div class="ml-2 flex-grow">
								<div class="h-4 rounded w-1/4 shimmer"></div>
								<div class="h-3 rounded w-1/3 mt-1 shimmer"></div>
							</div>
						</div>
						<div class="h-16 rounded shimmer"></div>
						<div class="flex justify-between mt-2">
							<div class="h-4 rounded w-1/6 shimmer"></div>
							<div class="h-4 rounded w-1/6 shimmer"></div>
							<div class="h-4 rounded w-1/6 shimmer"></div>
						</div>
					</div>
				</slot>
			{/each}
		{/if}
	</svelte-virtual-list-contents>
</svelte-virtual-list-viewport>

<style>
	svelte-virtual-list-viewport {
		position: relative;
		overflow-y: auto;
		/* overflow: visible; */
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
