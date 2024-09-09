<script lang="ts">
	import { Drawer } from 'vaul-svelte';
	export let dismissible: boolean = true;
	export let scaleBackground: boolean = true;
	export let open: boolean = false;
	export let onClose: any;
</script>

<Drawer.Root {dismissible} bind:open shouldScaleBackground={scaleBackground} {onClose}>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content class="pb-8 pt-3 bg-basic absolute top-0 left-0 right-0 z-10 mobile-height">
			<div class="sr-only" tabindex="-1" autofocus />
			<slot />
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
