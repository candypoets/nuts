<script lang="ts">
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Extract nprofile data from node attributes
	const tag = node.attrs?.tag || '';

	$: console.log(node.attrs);
</script>

<NodeViewWrapper class="inline">
	<a class="font-semibold text-primary" href={'/search/' + tag}>{tag}</a>
</NodeViewWrapper>
