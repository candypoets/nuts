<script lang="ts">
	import { Drawer } from 'vaul-svelte';
	export let open: boolean = false;
</script>

<Drawer.NestedRoot bind:open shouldScaleBackground={false}>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="pb-8 pt-3 bg-basic absolute top-0 left-0 right-0 z-10 mobile-height"
			style="padding-top: env(safe-area-inset-top, 20px);"
		>
			<div class="sr-only" tabindex="-1" autofocus />
			<slot />
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.NestedRoot>
