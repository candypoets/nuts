<script>
	import { Drawer } from 'vaul-svelte';
	let isOpen = false;
</script>

<button on:click={() => (isOpen = !isOpen)}>Toggle Drawer</button>

<Drawer.Root open={isOpen}>
	<Drawer.Portal>
		<Drawer.Overlay />
		<Drawer.Content>
			<p>This is a test drawer</p>
			<button on:click={() => (isOpen = false)}>Close</button>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
