<script lang="ts">
	import Icon from '@iconify/svelte';
	import { signAndSend } from 'src/actions/relay';
	import type { Contact } from 'src/model/contact';
	import { contacts, db, key } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { Drawer } from 'vaul-svelte';

	export let open: boolean = false;

	let loading: boolean = false;

	let user: Contact = { pubkey: '', name: '', picture: '', about: '', createdAt: 0 };

	let pubkey: string = '';

	async function search() {
		console.log('search');
		user.pubkey = '';
		loading = true;
		const abortController = new AbortController();
		const signal = abortController.signal;

		setTimeout(() => {
			abortController.abort();
		}, 10000);

		try {
			const isAuth = await $pool.query([{ authors: [pubkey], kinds: [0] }], { signal });
			console.log(isAuth);
			user = JSON.parse(isAuth[0].content);
		} catch (error) {
			console.log(error);
			loading = false;
		} finally {
			loading = false;
		}
	}
</script>

<Drawer.Root bind:open>
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
				<h2 class="text-xl font-bold">Add Friend</h2>
				<div class="join w-full mt-4">
					<input
						placeholder="Enter pubkey"
						bind:value={pubkey}
						class="join-item flex-grow px-2 bg-base-100"
					/>
					<button class="btn join-item btn-primary" on:click={() => search()}>
						{#if loading}
							<div class="loading" />
						{:else}
							<Icon icon="mdi:search" />
						{/if}
					</button>
				</div>
				{#if user.pubkey != ''}
					<div
						class="shadow rounded-2xl p-2 flex items-stretch justify-start
           mt-4"
					>
						<img
							src={user.picture || '/ns-naked.svg'}
							alt={user.name}
							class="border w-16 h-16 rounded-full space-x-4"
						/>
						<div class="ml-4 flex-grow">
							<p class="font-bold">{user.name}</p>
							<p class="text-xs">{user.about}</p>
						</div>
						<div class="flex items-end">
							<button
								class="btn btn-circle"
								on:click={async () => {
									console.log('add friend');
									await $db.contacts.add({
										...user,
										pubkey,
										createdAt: Math.floor(Date.now() / 1000)
									});
									await signAndSend({
										kind: 3,
										pubkey: $key?.pub,
										created_at: Math.floor(Date.now() / 1000),
										// tags: [['p', pubkey]],
										tags: $contacts.map((c) => ['p', c.pubkey]),
										content: ''
									});
								}}><Icon icon="mingcute:user-follow-fill" /></button
							>
						</div>
					</div>
				{/if}
			</div></Drawer.Content
		>
	</Drawer.Portal>
</Drawer.Root>
