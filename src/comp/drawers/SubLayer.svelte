<script lang="ts">
	import { Drawer } from 'vaul-svelte';

	export let scaleBackground: boolean = true;
	export let open: boolean = false;
	export let onClose: any = undefined;
</script>

<Drawer.NestedRoot bind:open {onClose} shouldScaleBackground={false}>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="rounded-t-3xl pb-8 pt-3 bg-basic absolute left-0 right-0 fine-border z-10 mobile-height-95"
			style="top: calc(0.5rem + env(safe-area-inset-top, 20px));"
		>
			<div class="sr-only" tabindex="-1" autofocus />
			<slot />
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.NestedRoot>
