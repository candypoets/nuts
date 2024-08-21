<script lang="ts">
	import Icon from '@iconify/svelte';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import type { NostrEvent } from '@nostrify/nostrify';
	import { type UnsignedEvent } from 'nostr-tools';
	import { decodePrivKey, nostrPrivKey, nostrPubKey, pool, signer } from 'src/stores/nostr';

	let privateKey = '';
	let name = '';
	let picture = '';
	let about = '';

	let loading = false;

	let kind: 'login' | 'signup' = 'login';

	async function handleLogin() {
		// Handle login logic here
		console.log('Logging in with private key:', privateKey);

		const pk = decodePrivKey(privateKey);

		const pubkey = bytesToHex(schnorr.getPublicKey(pk));
		const privkey = bytesToHex(pk);

		console.log(pk, pubkey);
		loading = true;
		const isAuth = await pool.query([{ authors: [pubkey], kinds: [0], limit: 1 }]);

		loading = false;
		$nostrPubKey = pubkey;
		$nostrPrivKey = privkey;

		console.log(isAuth);
	}

	async function handleSignup() {
		const priv = schnorr.utils.randomPrivateKey();
		$nostrPrivKey = bytesToHex(priv);
		$nostrPubKey = bytesToHex(schnorr.getPublicKey(priv));
		// Handle signup logic here
		// console.log('Signing up with details:', userName, profilePicture, bio);

		let event: UnsignedEvent = {
			kind: 0,
			tags: [],
			content: JSON.stringify({
				name,
				about,
				picture
			}),
			created_at: Math.floor(Date.now() / 1000),
			pubkey: $nostrPubKey
		};
		if (window.nostr) {
			event = await window.nostr.signEvent(event);
		} else {
			event = await $signer.signEvent(event);
		}
		console.log(event);

		pool.event(event as NostrEvent);
	}
</script>

<main class="flex items-center mobile-height">
	{#if kind == 'login'}
		<div class="h-1/2">
			<h1 class="text-3xl text-center uppercase font-bold px-4">Login with your private key</h1>
			<h2 class="text-center mt-8 px-4">
				To give <strong>nuts.cash</strong> full access to your nostr identity, enter your private key
				below
			</h2>

			<form class="px-8 mt-8" on:submit|preventDefault={handleLogin}>
				<div class="join w-full">
					<div class="btn join-item btn-link"><Icon icon="ri:key-fill" /></div>
					<input
						placeholder="nsec"
						class="join-item flex-grow px-2"
						type="text"
						bind:value={privateKey}
					/>
					<button class="btn join-item btn-primary" type="submit"
						>{#if !loading}<Icon icon="mdi:login" />
						{:else}
							<div class="loading" />{/if}
					</button>
				</div>
			</form>
			<p class="mx-8 text-xs text-center mt-8 p-4 rounded-lg bg-slate-100">
				Note that sharing your private key directly is not recommended, instead you should use a
				compatible browser extension to securely store your key.
			</p>
			<p class="mx-8 text-xs text-center mt-8 p-4">
				Don't have a nostr account?<button class="btn btn-link" on:click={() => (kind = 'signup')}
					>Signup</button
				>
			</p>
		</div>
	{:else}
		<div>
			<h1 class="text-3xl text-center uppercase font-bold px-4">
				Becoming Self Sovereign Starts Here
			</h1>
			<form on:submit|preventDefault={handleSignup} class="px-8">
				<label class="block mt-4">
					<strong class="pb-2 block">Your Name</strong>

					<div class="join w-full">
						<div class="btn join-item btn-link"><Icon icon="ri:user-fill" /></div>
						<input type="text" class="join-item flex-grow px-2" bind:value={name} />
					</div>
				</label>
				<label class="block mt-4">
					<strong class="pb-2 block">About You (optional)</strong>
					<textarea class="w-full p-2" rows="3" bind:value={about}></textarea>
				</label>

				<label class="block mt-4">
					<strong class="pb-2 block">Profile Picture (optional)</strong>
					<div class="join w-full">
						<div class="btn join-item btn-link"><Icon icon="ic:baseline-photo-camera" /></div>
						<input
							type="text"
							class="join-item flex-grow px-2"
							placeholder="https://"
							bind:value={picture}
						/>
					</div>
				</label>
				<br />
				<button class="btn btn-primary mx-auto w-full" type="submit">Signup</button>
			</form>
			<p class="mx-8 text-xs text-center mt-4 p-1">
				Already have a Nostr account?<button class="btn btn-link" on:click={() => (kind = 'login')}
					>Login</button
				>
			</p>
		</div>
	{/if}
</main>
