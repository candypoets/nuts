<script lang="ts">
	import { browser } from '$app/environment';
	import { sendMessage } from 'src/actions/chat';
	import { saveNuts, send } from 'src/actions/wallet';
	import { db } from 'src/stores/db';
	import { mintInfos } from 'src/stores/mints';
	import { nostrPubKey } from 'src/stores/nostr';
	import { wallets } from 'src/stores/wallet';
	import { onMount } from 'svelte';

	// export let active: string;
	export let toPub: string;
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
			await sendMessage(toPub, res.encodedToken, [['amount', res.amount]])
				.then(async () => {
					console.info(
						'return change',
						res.returnChanges.reduce((a, b) => a + b.amount, 0)
					);
					// add the change to the proofs table
					await $db.proofs.bulkAdd(res.returnChanges);

					await saveNuts(res.returnChanges, $nostrPubKey);
				})
				.catch(async (e) => {
					// keep the sent proofs for yourself as renewed proofs
					await $db.proofs.bulkAdd(res.sends);
					// add the returnchange to the proofs table
					await $db.proofs.bulkAdd(res.returnChanges);

					await saveNuts([...res.returnChanges, ...res.sends], $nostrPubKey);
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

<div class="">
	{#if !processing}
		<div class="flex flex-col w-full items-center gap-3">
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
					class="mt-10 text-7xl focus:outline-none text-center max-w-xs"
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
