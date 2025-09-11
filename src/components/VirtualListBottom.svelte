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

	let foo;

	// read-only, but visible to consumers via bind:start
	export let start = 0;
	export let end = 0;
	export let down = true;

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
	let lastScrollTop = 0;

	function reverseScroll(event) {
		event.preventDefault();
		let deltaY = event.deltaY || event.detail || event.wheelDelta;

		// Reverse the deltas
		deltaY = -deltaY;

		event.currentTarget.scrollTop += deltaY;
	}

	let startY;

	function handleTouchStart(event) {
		// startY = event.touches[0].pageY;
	}

	function handleTouchMove(event) {
		// if (!startY) return;
		// let deltaY = startY - event.touches[0].pageY;
		// // Reverse the deltas
		// deltaY = -deltaY;
		// event.preventDefault();
		// event.currentTarget.scrollTop += deltaY;
		// startY = event.touches[0].pageY;
	}

	$: visible = uniqBy(items.slice(0, end), getItemId).map((data, i) => {
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

	async function handle_scroll() {
		let { scrollTop } = viewport;

		// Track scroll direction (inverted because of rotateZ(180deg) transform)
		down = scrollTop < lastScrollTop;
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
	class="scrollbar-hide {className}"
	style="height: {height}; max-height: 100vh; transform: rotateZ(180deg);"
	on:wheel={reverseScroll}
>
	<svelte-virtual-list-contents
		bind:this={contents}
		style="top: {top}px; padding-bottom: {bottom > 100 ? bottom : 100}px;"
		class={backdrop && 'bg-base-300 bg-opacity-85 w-feed-container mx-auto min-h-screen rounded-xl'}
	>
		<svelte-virtual-list-row style="transform: rotateZ(180deg);">
			<slot name="feed-header" />
		</svelte-virtual-list-row>
		{#each visible as row, index (getItemId(row.data))}
			<svelte-virtual-list-row style="transform: rotateZ(180deg);">
				<slot item={row.data} itemIndex={index}>Missing template</slot>
			</svelte-virtual-list-row>
		{/each}
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
