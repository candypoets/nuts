<script lang="ts">
	import TokenIcon from 'src/comp/TokenIcon.svelte';
	import { browser } from '$app/environment';
	import { sendMessage } from 'src/actions/chat';
	import { formatAmount, saveNuts, send } from 'src/actions/wallet';
	import { db, key, settings, Status } from 'src/stores/db';
	import { mintInfos, totalAmountAvailable } from 'src/stores/mints';
	import { wallets } from 'src/stores/wallet';
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import type { Contact } from 'src/model/contact';

	// export let active: string;
	export let selected: Contact;
	export let subopen: boolean = false;
	let memo: string = '';

	let amount: number | undefined = undefined;
	// let invoice: string;
	// let fees: 0;
	let processing = '';

	$: {
		if (!/^[0-9]*$/.test(amount)) {
			amount = '';
		}
	}

	onMount(() => {
		if (browser) {
			if (
				/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
			) {
				return;
			}
			document.getElementById('send-amt')?.focus();
		}
	});

	const sendEcash = async () => {
		try {
			processing = 'Creating Token';
			const res = await send($wallets, amount as number, memo);
			processing = 'Sending Token';
			await sendMessage(selected.pubkey, res.encodedToken)
				.then(async () => {
					console.info(
						'return change',
						res.returnChanges.reduce((a, b) => a + b.amount, 0)
					);
					// add the change to the proofs table
					if (res.returnChanges.length) {
						await $db.proofs.bulkPut(
							res.returnChanges.map((p) => ({ ...p, status: Status.Confirmed }))
						);
						await $db.proofs.bulkPut(res.sends.map((p) => ({ ...p, status: Status.Spent })));
						await saveNuts(res.returnChanges, $key?.pub);
					}
				})
				.catch(async (e) => {
					// keep the sent proofs for yourself as renewed proofs
					await $db.proofs.bulkAdd(res.sends.map((p) => ({ ...p, status: Status.Confirmed })));
					// add the returnchange to the proofs table
					await $db.proofs.bulkAdd(
						res.returnChanges.map((p) => ({ ...p, status: Status.Confirmed }))
					);

					await saveNuts([...res.returnChanges, ...res.sends], $key?.pub);
					console.error(e);
				});

			processing = 'Token Sent';
			setTimeout(() => {
				processing = '';
			}, 2000);
		} catch (e) {
			processing = '';
			console.error(e);
		}
	};
</script>

<div class="px-4 flex justify-between">
	<div on:click={() => (subopen = false)}>
		<Icon icon="mdi:close" class="w-6 h-6" />
	</div>
	<strong> Send Ecash </strong>
	<div />
</div>
<div class="">
	<div class="p-4">
		<div class="flex gap-4 items-center">
			<div class="w-1/2 text-center">
				<strong class="text-xs">Main Account</strong>
				<div class="flex gap-1 items-center justify-center">
					<TokenIcon />
					<p class="font-bold">
						{formatAmount($totalAmountAvailable, $settings.unit)}
					</p>
				</div>
			</div>
			<div class="flex justify-center">
				<Icon icon="mdi:arrow-right" class="text-2xl border rounded-full" />
			</div>
			<div class="flex items-center justify-center py-2 border-b last:border-none w-1/2">
				<!-- <Icon icon="carbon:lightning" class="w-16 h-6" />
										-->
				<div class="w-16">
					<img
						src={selected?.picture || '/ns-naked.svg'}
						alt={selected?.name}
						class="border w-8 h-8 rounded-full space-x-4 mx-auto"
					/>
				</div>
				<div class="text-xs">
					<strong>{selected?.name}</strong>
				</div>
			</div>
		</div>
	</div>
</div>
<div class="">
	{#if !processing}
		<div class="w-full gap-3">
			<!-- <div class="z-10">
				<MintSelector bind:mint />
			</div> -->

			<div class="h-52 flex flex-col items-center">
				<input
					autofocus
					id="send-amt"
					placeholder="0"
					type="text"
					inputmode="decimal"
					bind:value={amount}
					class="mt-10 text-7xl focus:outline-none text-center max-w-xs border rounded-xl"
					on:keydown={(e) => {
						if (e.key === 'Enter') {
							sendEcash();
						}
					}}
				/>
				<p />
				<p class="font-bold text-xl">Sats</p>
			</div>
		</div>

		<div class="px-4 w-full mt-36">
			<button
				class=" btn w-full btn-primary"
				disabled={!amount || !Number(amount) || amount > $mintInfos.totalAmountAvailable}
				on:click={() => sendEcash()}
			>
				{#if Number(amount) > $mintInfos.totalAmountAvailable}
					Not enough funds
				{:else}
					Send
				{/if}
			</button>
		</div>
	{/if}
</div>
