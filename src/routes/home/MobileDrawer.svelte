<script lang="ts">
	import { Drawer } from 'vaul-svelte';

	export let isOpen: boolean;
</script>

<Drawer.Root open={isOpen}>
	<Drawer.Portal>
		<Drawer.Overlay />
		<Drawer.Content>
			<div class="p-4">
				<h2>Vaul Drawer Content</h2>
				<p>This is the content of your Vaul drawer.</p>
			</div>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>

<style>
	/* You can add any additional styles here */
	:global(.vaul-drawer-overlay) {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.4);
	}

	:global(.vaul-drawer-content) {
		background-color: white;
		display: flex;
		flex-direction: column;
		border-top-left-radius: 10px;
		border-top-right-radius: 10px;
		height: 96%;
		margin-top: 6rem;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
	}
</style>
