<script lang="ts" context="module">
	import { type FeedKind } from 'src/controller/feed';

	export type KindSwitcherTabId =
		| 'notes'
		| 'articles'
		| 'polls'
		| 'media'
		| 'events'
		| 'highlights';
	export type KindSwitcherTab = {
		id: KindSwitcherTabId;
		label: string;
		kinds?: FeedKind[];
	};
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let selectedKinds: FeedKind[] = [];
	export let ariaLabel = 'Content filters';
	export let includeHighlights = false;
	export let tabs: KindSwitcherTab[] = [
		{ id: 'notes', label: 'Notes' },
		{ id: 'media', label: 'Media', kinds: [20, 22] },
		{ id: 'events', label: 'Live', kinds: [30311] },
		{ id: 'highlights', label: 'Highlights', kinds: [9802] },
		{ id: 'polls', label: 'Polls', kinds: [1068] },
		{ id: 'articles', label: 'Articles', kinds: [30023] }
	];

	const dispatch = createEventDispatcher<{ select: { kinds: FeedKind[]; tab: KindSwitcherTab } }>();
	let localSelectedKinds: FeedKind[] = [];
	let lastSelectedKinds: FeedKind[] | undefined;
	$: visibleTabs = includeHighlights ? tabs : tabs.filter((tab) => tab.id !== 'highlights');

	$: if (selectedKinds !== lastSelectedKinds) {
		localSelectedKinds = selectedKinds;
		lastSelectedKinds = selectedKinds;
	}

	function sameKinds(left: FeedKind[], right: FeedKind[]) {
		if (left.length !== right.length) return false;
		return left.every((kind, index) => kind === right[index]);
	}

	function selectTab(tab: KindSwitcherTab) {
		localSelectedKinds = tab.kinds ? [...tab.kinds] : [];
		dispatch('select', { kinds: localSelectedKinds, tab });
	}

	function kindTabClass(selected: boolean) {
		return `relative h-10 min-w-20 flex-1 whitespace-nowrap px-3 pb-2 pt-1 text-base font-semibold border-b-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:text-base-content active:translate-y-px ${
			selected ? 'border-primary text-base-content' : 'border-transparent text-base-content/60'
		}`;
	}
</script>

<div class="kind-switcher flex w-full overflow-x-auto scrollbar-hide" aria-label={ariaLabel}>
	{#each visibleTabs as tab (tab.id)}
		{@const selected = tab.kinds
			? sameKinds(localSelectedKinds, tab.kinds)
			: localSelectedKinds.length === 0}
		<button
			type="button"
			class={kindTabClass(selected)}
			on:click|stopPropagation={() => selectTab(tab)}
			aria-pressed={selected}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	:global(html[data-theme='nuts']) .kind-switcher {
		gap: 0.25rem;
	}

	:global(html[data-theme='nuts']) .kind-switcher button {
		border-radius: 0.5rem 0.5rem 0 0;
	}

	:global(html[data-theme='nuts']) .kind-switcher button:hover {
		background: rgba(242, 235, 221, 0.045);
	}

	:global(html[data-theme='nuts']) .kind-switcher button[aria-pressed='true'] {
		background: linear-gradient(to top, rgba(223, 114, 92, 0.12), transparent 80%);
		color: #f2ebdd;
	}
</style>
