<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { Drawer } from 'vaul-svelte';

	export let dismissible: boolean = true;
	export let scaleBackground: boolean = true;
	export let open: boolean = false;

	let viewport = { width: 0, height: 0 };

	onMount(() => {
		if (browser) {
			viewport = {
				width: window.innerWidth,
				height: window.innerHeight
			};
		}
	});

	$: desktop = viewport.width > 1024;
</script>

<Drawer.Root
	shouldScaleBackground={scaleBackground && !desktop}
	dismissible={dismissible && !desktop}
	bind:open
>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10 lg:hidden" />
		<Drawer.Content
			class="rounded-t-3xl pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 fine-border z-10 mobile-height-95 lg:w-1/4 lg:right-0 lg:left-auto lg:shadow"
			style="top: calc(1rem + env(safe-area-inset-top, 20px));"
		>
			<div class="sr-only" tabindex="-1" autofocus />
			<slot />
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
