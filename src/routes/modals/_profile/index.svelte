<script lang="ts">
	import Icon from '@iconify/svelte';

	import Theme from 'src/components/Theme.svelte';
	import { getContext } from 'svelte';
	import { go } from 'src/routes/modals/modal';
	import { kind0 } from 'src/controller/nostr';
	import { asKind0 } from '@candypoets/nipworker/utils';
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { key } from 'src/controller';

	let animator = getContext('animator');
	let search: string;

	$: k0 = asKind0($kind0 as ParsedEvent);
	// export let encodedToken: string = '';
	//
</script>

<div class="h-screen bg-base-300 bg-opacity-85 backdrop-blur-md">
	<div class="w-feed md:pt-4 pt-safe">
		<div class="px-4 flex justify-between">
			<div on:click={animator.goBack}>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</div>
		</div>
		<div class="flex gap-2 items-center">
			<button class="mt-4 ml-4" on:click={() => go('kind0')}>
				<img
					class="w-12 h-12 border rounded-full"
					src={proxyAvatarUrl(asKind0($kind0)?.picture()?.toString()) || '/miss-profile.png'}
				/></button
			>
			<button class="btn btn-outline mt-4 btn-circle" on:click={() => go('theme')}>
				<Icon icon="mdi:palette" class="text-2xl" />
			</button>
		</div>
	</div>
	<div class="p-4 overflow-scroll">
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
				class="flex items-center justify-around py-4 border-b last:border-none cursor-pointer"
				on:click|stopPropagation={() => go('logout')}
			>
				<Icon icon="mdi:logout" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Log out</strong>
					<!-- <p class="text-xs">Notifications</p> -->
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<!-- <div class="flex items-center justify-around py-4 border-b last:border-none">
			<Icon icon="mdi:bell-outline" class="w-16 h-6" />
			<div class="flex-grow">
				<strong>Notifications</strong>
			</div>
			<Icon icon="carbon:arrow-right" class="w-16 h-6" />
		</div> -->
		</div>
		<h3 class="font-bold">Profile</h3>
		<div class="my-4 rounded-lg border">
			<div
				class="flex items-center justify-around py-4 border-b last:border-none"
				on:click|stopPropagation={() => go('nprofile:' + $key?.pub)}
			>
				<Icon icon="mdi:account-outline" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>My Profile</strong>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div
				class="flex items-center justify-around py-4 border-b last:border-none"
				on:click|stopPropagation={() => go('keys')}
			>
				<Icon icon="wpf:keysecurity" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Keys</strong>
					<!-- <p class="text-xs">Notifications</p> -->
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div class="flex items-center justify-around py-2 border-b" on:click={() => go('relays')}>
				<Icon icon="game-icons:bird-mask" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Relays</strong>
					<p class="text-xs">Your relay of choice</p>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
			<div class="flex items-center justify-around py-2" on:click={() => go('wallet')}>
				<Icon icon="mdi:bank-outline" class="w-16 h-6" />
				<div class="flex-grow">
					<strong>Wallet</strong>
					<p class="text-xs">Your wallet preferences</p>
				</div>
				<Icon icon="carbon:arrow-right" class="w-16 h-6" />
			</div>
		</div>
	</div>
</div>
