<script lang="ts">
	import Icon from '@iconify/svelte';

	export let selectedLists: any[] = [];

	export let getTitle = (item: any) => item.title || '';

	export let removeItem = (index: any) => {
		selectedLists = selectedLists.filter((_, i) => i !== index);
	};

	let searchValue = '';

	export let onSearch: (query: string) => void = () => {};

	export const clearSearch = () => {
		searchValue = '';
	};

	export let search = false;

	// Watch for changes in selectedLists and clear search when items are added
	$: if (selectedLists) {
		const prevLength = prevSelectedListsLength || 0;
		if (selectedLists.length > prevLength) {
			clearSearch();
		}
		prevSelectedListsLength = selectedLists.length;
	}

	let prevSelectedListsLength: number;
</script>

<div
	class="flex flex-inline flex-wrap gap-2 items-center rounded-lg py-2 px-3"
	class:bg-base-100={search}
>
	{#each selectedLists as list, i}
		<div
			class="badge badge-accent gap-1 pl-3 pr-2 py-3 cursor-pointer"
			on:click|stopPropagation={() => removeItem(list)}
		>
			{getTitle(list)}
			<button
				on:click|stopPropagation={() => removeItem(list)}
				class="btn btn-xs btn-circle btn-ghost"
			>
				<Icon icon="mdi:close" class="text-sm" />
			</button>
		</div>
	{/each}
	{#if search}
		<input
			type="text"
			class="input input-sm outline-none focus:outline-none border-none -ml-2 flex-grow bg-transparent"
			placeholder="Search..."
			on:keydown={(e) => {
				if (e.key === 'Enter') {
					onSearch(searchValue);
				} else if (e.key === 'Backspace' && searchValue === '' && selectedLists.length > 0) {
					removeItem(selectedLists[selectedLists.length - 1]);
				}
			}}
			bind:value={searchValue}
			on:input={() => onSearch(searchValue)}
		/>
	{/if}
</div>
