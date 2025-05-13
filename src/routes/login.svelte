<script lang="ts">
	import Icon from '@iconify/svelte';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import { kinds, nip19, type EventTemplate } from 'nostr-tools';
	import { onMount } from 'svelte';

	import { now } from 'src/lib/period';
	import { decodePrivKey } from 'src/lib/wallet';
	import { isKind0, type AnyKind } from 'src/types';
	import { key } from 'src/controller';
	import { nostrManager, type SubscribeKind } from 'src/model/nostr';
	import type { ParsedEvent } from 'src/types';

	let privateKey = '';
	let name = '';
	let picture = '';
	let about = '';

	let loading = false;

	let kind: 'login' | 'signup' = 'login';

	let extensionError = false;

	$: {
		if (extensionError) {
			setTimeout(() => {
				extensionError = false;
			}, 5000);
		}
	}

	async function handleLogin() {
		// Handle login logic here
		console.log('Logging in with private key:', privateKey);

		// build a key object to store in the db
		const pk = decodePrivKey(privateKey);

		const pubkey = bytesToHex(schnorr.getPublicKey(pk));
		const privkey = bytesToHex(pk);

		loading = true;

		const loginSub = nostrManager.subscribe(
			'login_' + pubkey,
			[{ kinds: [kinds.Metadata], authors: [pubkey], limit: 1, relays: [] }],
			(events: ParsedEvent<AnyKind>[], kind: SubscribeKind) => {
				const [event, ...context] = events;
				if (isKind0(event)) {
					loading = false;
					$key = {
						pub: pubkey,
						priv: privkey,
						npub: nip19.npubEncode(pubkey),
						nsec: nip19.nsecEncode(pk)
					};
					loginSub();
				}
			}
		);
	}

	async function handleSignup() {
		const priv = schnorr.utils.randomPrivateKey();
		const privkey = bytesToHex(priv);
		const pubkey = bytesToHex(schnorr.getPublicKey(priv));

		// Handle signup logic here
		// console.log('Signing up with details:', userName, profilePicture, bio);

		$key = {
			pub: pubkey,
			priv: privkey,
			npub: nip19.npubEncode(pubkey),
			nsec: nip19.nsecEncode(priv)
		};

		let event: EventTemplate = {
			kind: 0,
			tags: [],
			content: JSON.stringify({
				name,
				about,
				picture
			}),
			created_at: now()
		};

		nostrManager.publish('signup', event);
	}

	onMount(async () => {
		if (window?.nostr?.nip04) {
			// const pubKey = await window.nostr.getPublicKey();
			// keysCache.add({
			// 	pub: pubKey,
			// 	npub: nip19.npubEncode(pubKey)
			// });
			// $activeAccount = Array.from($keysCache.values()).findIndex((k) => k.pub == pubKey);
		} else if (window.localStorage.getItem('nostr-privkey')) {
			// backward compatibility
			privateKey = window.localStorage.getItem('nostr-privkey');
			handleLogin();
		}
	});
</script>

<main class="w-full flex place-content-center mobile-height">
	{#if kind == 'login'}
		<div class="h-1/2 w-full md:w-1/2 xl:w-1/3 py-48">
			<h1 class="text-3xl text-center font-bold px-4 text-slate-700">
				Login with your private key
			</h1>
			<p class="text-center mt-2 px-4 text-slate-400">
				To give <strong>nuts.cash</strong> full access to your Nostr identity, enter your Nostr private
				key below.
			</p>
			{loading}
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
			<!-- <button
				class="btn btn-outline mt-4 m-auto block"
				class:btn-error={extensionError}
				on:click={async () => {
					const pubKey = await window?.nostr?.getPublicKey();
					if (!pubKey) {
						extensionError = true;
						return;
					}
					$keys
					keysCache.put({
						pub: pubKey,
						npub: nip19.npubEncode(pubKey)
					});
					$activeAccount = Array.from($keysCache.values()).findIndex((k) => k.pub == pubKey);
					console.log('clicked', $activeAccount);
				}}
			>
				{#if !extensionError}
					Log in with an extension
				{:else}
					Extension not found
				{/if}
			</button> -->
			<p class="mx-8 text-xs text-center mt-8 p-4 rounded-lg bg-slate-100 text-slate-500">
				Note that sharing your private key directly is not recommended, instead you should use a
				compatible browser extension to securely store your key.
			</p>
			<p class="text-xs text-center mt-2 text-gray-500">
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
