<script lang="ts">
	import Icon from '@iconify/svelte';

	import { manager, type ParsedEvent } from '@candypoets/nipworker';
	import { asKind0 } from '@candypoets/nipworker/utils';
	import { key } from 'src/controller';
	import { kind0 } from 'src/controller/nostr';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import { go } from 'src/routes/modals/modal';
	import { getContext } from 'svelte';

	let animator = getContext('animator');
	let search: string;

	$: k0 = asKind0($kind0 as ParsedEvent);
	// export let encodedToken: string = '';
	//
	//

	$: accounts = Object.keys(manager.getAccounts()).sort((a, b) =>
		$key?.pub === a ? -1 : $key?.pub === b ? 1 : a.localeCompare(b)
	);
</script>

<div class="h-screen bg-base-300 bg-opacity-85 backdrop-blur-md">
	<div class="w-feed md:pt-4 pt-safe">
		<div class="px-4 flex justify-between">
			<div on:click={animator.goBack}>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</div>
		</div>
		<div class="flex items-center justify-between px-4 mt-4">
			<div class="flex gap-2">
				{#each accounts as key, index}
					<button
						on:click={() => (index ? manager.switchAccount(key) : go('kind0'))}
						class="btn btn-circle"
					>
						<Avatar pubkey={key} size="xl" customClass={!index ? 'border border-accent' : ''} />
					</button>
				{/each}
				<button class="btn btn-outline btn-circle" on:click={() => go('login')}>
					<!-- <Icon icon="mingcute:add" class="text-xl" /> -->
					<Icon icon="material-symbols:add" class="text-xl" />
				</button>
			</div>
			<button class="btn btn-outline btn-circle" on:click={() => go('theme')}>
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
