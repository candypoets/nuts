<script lang="ts">
	import User from 'src/routes/explore/user.svelte';
	import { onMount } from 'svelte';
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Extract nprofile data from node attributes
	const npub = node.attrs?.pubkey || '';
	const bech32 = node.attrs?.bech32 || '';

	// Display formatted name (without the full npub in UI)
	$: displayName = npub ? `${npub.substring(0, 8)}...` : 'Unknown user';

	// Handle click to potentially view profile
	function handleClick() {
		// You can dispatch a custom event to handle profile navigation
		// or implement inline functionality
	}
</script>

<NodeViewWrapper class="inline">
	<User pubkey={npub} context={[]} />
</NodeViewWrapper>
