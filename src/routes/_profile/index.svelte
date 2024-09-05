<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Drawer } from 'vaul-svelte';
	import Keys from './keys.svelte';
	import Logout from './logout.svelte';
	import Relays from './relays.svelte';
	import { profile } from 'src/stores/profile';
	import Mints from './mints.svelte';
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';

	let active: string;
	let search: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	export let subopen: boolean = false;

	let route: 'logout' | 'keys' | 'relays' | 'mints' | 'keys' = 'logout';
</script>

<!-- <ScanLN bind:invoice={scannedNpub} /> -->
<Fullscreen dismissible={!subopen} bind:open>
	<!-- <Drawer.Trigger /> -->
	<div class="fixed w-full bg-basic">
		<div class="px-4 flex justify-between">
			<div on:click={() => (open = false)}>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</div>
			<!-- <div class="flex space-x-8">
						<div on:click={() => (scan = true)}>
							<Icon icon="ic:baseline-qrcode" class="text-xl" />
						</div>
						<div on:click={() => (addFriend = true)}>
							<Icon icon="mingcute:add-fill" class="text-xl" />
						</div>
					</div> -->
		</div>
		<h2 class="text-xl font-bold px-4 pt-4">{$profile.name || 'Profile'}</h2>
	</div>
	<div class="p-4 container-height overflow-scroll !pt-20" id="container">
		<div class="join bg-base-200 rounded-md w-full">
			<div class="join-item p-2">
				<Icon icon="carbon:search" />
			</div>
			<input
				placeholder="Search"
				bind:value={search}
				class="join-item flex-grow px-2 outline-none bg-transparent"
			/>
		</div>
		<div class="my-4 rounded-lg border">
			<div
				class="flex items-center justify-around py-4 border-b last:border-none"
				on:click={() => {
					subopen = true;
					route = 'logout';
				}}
			>
				<Icon icon="mdi:logout" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Log out</strong>
					<!-- <p class="text-xs">Notifications</p> -->
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div
				class="flex items-center justify-around py-4 border-b last:border-none"
				on:click={() => {
					subopen = true;
					route = 'keys';
				}}
			>
				<Icon icon="mdi:bell-outline" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Notifications</strong>
					<!-- <p class="text-xs">Notifications</p> -->
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
		</div>
		<h3 class="font-bold">Profile</h3>
		<div class="my-4 rounded-lg border">
			<div
				class="flex items-center justify-around py-4 border-b last:border-none"
				on:click={() => {
					subopen = true;
					route = 'keys';
				}}
			>
				<Icon icon="wpf:keysecurity" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Keys</strong>
					<!-- <p class="text-xs">Notifications</p> -->
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div
				class="flex items-center justify-around py-2 border-b"
				on:click={() => {
					console.log('clicked');
					subopen = true;
					route = 'relays';
				}}
			>
				<Icon icon="game-icons:bird-mask" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Relays</strong>
					<p class="text-xs">Your relay of choice</p>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div
				class="flex items-center justify-around py-2"
				on:click={() => {
					subopen = true;
					route = 'mints';
				}}
			>
				<Icon icon="mdi:bank-outline" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Mints</strong>
					<p class="text-xs">The mint you trust</p>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
		</div>
	</div>
	{#if route == 'logout'}
		<Logout bind:subopen />
	{:else if route == 'keys'}
		<Keys bind:subopen />
	{:else if route == 'relays'}
		<Relays bind:subopen />
	{:else if route == 'mints'}
		<Mints bind:subopen />
	{/if}
</Fullscreen>
