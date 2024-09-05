<script lang="ts">
	import { Drawer } from 'vaul-svelte';

	export let dismissible: boolean = true;
	export let scaleBackground: boolean = true;
	export let open: boolean = false;
</script>

<Drawer.Root shouldScaleBackground={scaleBackground} {dismissible} bind:open>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="rounded-t-3xl pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 fine-border z-10 mobile-height-95"
		>
			<div class="sr-only" tabindex="-1" autofocus />
			<slot />
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
