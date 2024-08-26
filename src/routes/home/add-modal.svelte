<script lang="ts">
	import Icon from '@iconify/svelte';
	import Minting from 'src/comp/mint/Minting.svelte';
	import { mints } from 'src/stores/mints';
	import { Drawer } from 'vaul-svelte';

	let active: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	export let subopen: boolean = false;

	let activeMint = $mints[0];

	// const navigate = () => {
	// 	isMinting = false;
	// 	isToken = false;
	// 	if (activeR === 'scan-receive' || doMint) {
	// 		activeR = 'receive';
	// 		doMint = false;
	// 	} else {
	// 		active = 'base';
	// 	}
	// };

	$: console.log('open', open);
</script>

<Drawer.Root dismissible={!subopen} bind:open>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="rounded-t-3xl pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 fine-border z-10"
			style="height: 95vh;"
		>
			<div class="px-4">
				<div on:click={() => (open = false)}>
					<Icon icon="mdi:close" class="w-6 h-6" />
				</div>
			</div>
			<div class="p-4">
				<h2 class="text-xl font-bold">Add Money</h2>
				<div class="my-4 rounded-lg border">
					<div
						class="flex items-center justify-around py-2 border-b"
						on:click={() => (subopen = true)}
					>
						<Icon icon="carbon:lightning" class="w-6 h-6" />
						<div>
							<strong>Add money instantly</strong>
							<p class="text-xs">Top up with lightning</p>
						</div>
						<Icon icon="carbon:arrow-right" class="w-6 h-6" />
					</div>

					<div class="flex items-center justify-around py-2 border-b">
						<Icon icon="carbon:user" class="w-6 h-6" />
						<div>
							<strong>Request from friends</strong>
							<p class="text-xs">Instant with zap</p>
						</div>
						<Icon icon="carbon:arrow-right" class="w-6 h-6" />
					</div>
					<div class="flex items-center justify-around py-2">
						<Icon icon="carbon:qr-code" class="w-6 h-6" />
						<div>
							<strong>Request via QR code</strong>
							<p class="text-xs">For easy or offline transfer</p>
						</div>
						<Icon icon="carbon:arrow-right" class="w-6 h-6" />
					</div>
				</div>

				<!-- <Minting bind:active bind:isMinting bind:doMint /> -->

				<!-- {#if !isMinting && !doMint && !isToken && $mints.length}
					<div class="divider">or</div>
				{/if} -->
				<!-- {#if !isMinting && !doMint}
					<Receiving bind:active bind:activeR bind:encodedToken bind:isToken />
				{/if} -->
			</div>
			<Drawer.NestedRoot bind:open={subopen} shouldScaleBackground={true}>
				<!-- <Drawer.Trigger /> -->
				<Drawer.Portal>
					<!-- <Drawer.Overlay class=" inset-0 bg-black/40 z-10" /> -->
					<Drawer.Content
						class="rounded-t-3xl pb-8 pt-3 bg-basic left-0 right-0 fine-border z-10 absolute top-4"
						style="height: 95vh;"
					>
						<div class="px-4">
							<div on:click={() => (subopen = false)}>
								<Icon icon="mdi:close" class="w-6 h-6" />
							</div>
						</div>
						<Minting isMinting={false} mint={activeMint} bind:active />
					</Drawer.Content>
				</Drawer.Portal>
			</Drawer.NestedRoot>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
