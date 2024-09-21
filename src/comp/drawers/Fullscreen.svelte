<script lang="ts">
	import { Drawer } from 'vaul-svelte';
	export let dismissible: boolean = true;
	export let scaleBackground: boolean = true;
	export let open: boolean = false;
	export let onClose: any;

	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

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
	dismissible={dismissible && !desktop}
	bind:open
	shouldScaleBackground={scaleBackground && !desktop}
	{onClose}
>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10 lg:hidden" />
		<Drawer.Content
			class="pb-8 bg-basic absolute top-0 left-0 right-0 z-10 mobile-height lg:w-1/4 lg:right-0 lg:left-auto lg:shadow"
			style="padding-top: env(safe-area-inset-top, 20px);"
		>
			<div class="sr-only" tabindex="-1" autofocus />
			<slot />
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
