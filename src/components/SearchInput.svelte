<script lang="ts">
	import Icon from '@iconify/svelte';

	export let value: string = '';
	export let placeholder: string = 'Search...';
	export let showSearchIcon: boolean = true;
	export let showClearButton: boolean = true;
	export let prefix: string = ''; // e.g., "To :" for newchat
	export let className: string = '';
	export let inputClassName: string = '';
	export let autofocus: boolean = false;

	let inputElement: HTMLInputElement;

	export function focus() {
		inputElement?.focus();
	}

	export function clear() {
		value = '';
		dispatch('clear');
	}

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher<{
		input: string;
		clear: void;
		keydown: KeyboardEvent;
	}>();

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;
		dispatch('input', value);
	}

	function handleKeydown(e: KeyboardEvent) {
		dispatch('keydown', e);
	}
</script>

<div
	class="relative flex items-center bg-base-200 rounded-full w-full {className}"
>
	<!-- Left side: Search icon or prefix -->
	{#if prefix}
		<span class="pl-4 pr-2 text-sm opacity-60 select-none">{prefix}</span>
	{:else if showSearchIcon}
		<div class="pl-4 pr-2 opacity-60">
			<Icon icon="carbon:search" class="w-4 h-4" />
		</div>
	{/if}

	<!-- Input field -->
	<input
		type="text"
		{placeholder}
		{value}
		bind:this={inputElement}
		class="flex-1 bg-transparent py-2.5 outline-none text-sm placeholder:opacity-50 {inputClassName}"
		on:input={handleInput}
		on:keydown={handleKeydown}
	/>

	<!-- Right side: Clear button -->
	{#if showClearButton && value}
		<button
			type="button"
			class="pr-3 pl-2 opacity-60 hover:opacity-100 transition-opacity"
			on:click={() => {
				value = '';
				dispatch('input', '');
				dispatch('clear');
				inputElement?.focus();
			}}
			aria-label="Clear search"
		>
			<Icon icon="mdi:close" class="w-4 h-4" />
		</button>
	{:else}
		<!-- Spacer to maintain consistent height when no clear button -->
		<div class="pr-1"></div>
	{/if}
</div>
