<script lang="ts">
	import type { WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isKind0 } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import { kinds, nip19, type EventTemplate } from 'nostr-tools';
	import { onMount } from 'svelte';

	import { key } from 'src/controller';
	import { now } from 'src/lib/period';
	import { decodePrivKey } from 'src/lib/wallet';
	import Nutscash from 'src/components/Nutscash.svelte';

	let privateKey = '';
	let name = '';
	let picture = '';
	let about = '';

	let loading = false;

	let kind: 'login' | 'signup' = 'signup';

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

		// build a key object to store in the db
		const pk = decodePrivKey(privateKey);

		const pubkey = bytesToHex(schnorr.getPublicKey(pk));
		const privkey = bytesToHex(pk);

		loading = true;

		const loginSub = useSubscription(
			'login_' + pubkey,
			[{ kinds: [kinds.Metadata], authors: [pubkey], limit: 1, relays: [] }],
			(message: WorkerMessage) => {
				const kind0 = isKind0(message);
				if (kind0) {
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

		usePublish('signup', event);
	}

	onMount(async () => {
		if (window?.nostr?.nip04) {
			// const pubKey = await window.nostr.getPublicKey();
			// keysCache.add({
			// 	pub: pubKey,
			// 	npub: nip19.npubEncode(pubKey)
			// });
			// $activeAccount = Array.from(Cache.values()).findIndex((k) => k.pub == pubKey);
		} else if (window.localStorage.getItem('nostr-privkey')) {
			// backward compatibility
			privateKey = window.localStorage.getItem('nostr-privkey');
			handleLogin();
		}
	});
</script>

<main
	class="bg-black bg-opacity-65 text-gray-800 md:flex flex md:flex-row flex-col justify-center items-stretch h-screen pt-safe"
>
	<div class="md:w-1/2 flex items-center justify-center">
		<div class="md:h-2/5">
			<Nutscash class="text-white md:h-96 md:w-96" />
		</div>
	</div>
	<div class="md:w-1/2">
		<main class="w-full place-content-center md:h-screen flex justify-center items-center">
			<div class="w-full md:px-4">
				<h1 class="text-5xl md:text-7xl font-bold px-4">
					<span class="text-purple-600">Nuts</span> <span class="text-primary">Cash</span>
					<span class="text-purple-600"> {'<'}</span>
				</h1>
				<br />
				<h1 class="md:text-6xl text-5xl font-bold px-4">
					<span class="text-purple-600">{'>'}</span> <span class="text-primary">Speak</span>
					<span class="text-purple-600">Up</span>
				</h1>
				{#if kind == 'login'}
					<div class="w-full">
						<form class="px-4 mt-8" on:submit|preventDefault={handleLogin}>
							<div class="join w-full">
								<!-- <div class="btn join-item btn-link"><Icon icon="ri:key-fill" /></div> -->
								<input
									placeholder="nsec"
									class="join-item flex-grow px-2"
									type="text"
									bind:value={privateKey}
								/>
								<button class="btn join-item btn-accent" type="submit"
									>{#if !loading}prove it
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
				}}
			>
				{#if !extensionError}
					Log in with an extension
				{:else}
					Extension not found
				{/if}
			</button> -->
						<p class="text-xs mt-2 text-gray-500 px-4">
							Not a notrich yet?<button
								class="btn btn-link text-accent"
								on:click={() => (kind = 'signup')}>Make a profile</button
							>
						</p>
					</div>
				{:else}
					<div>
						<form on:submit|preventDefault={handleSignup} class="px-4">
							<label class="block mt-4">
								<div class="pb-2 block text-white">Handle</div>

								<div class="join w-full border">
									<div class="btn join-item"><Icon icon="ri:user-fill" /></div>
									<input type="text" class="join-item flex-grow px-2" bind:value={name} />
								</div>
							</label>
							<label class="block mt-4 text-white">
								<div class="pb-2 block">About You (optional)</div>
								<textarea class="w-full p-2 rounded-lg" rows="3" bind:value={about}></textarea>
							</label>

							<label class="block mt-4">
								<div class="pb-2 block text-white">Profile Picture (optional)</div>
								<div class="join w-full border">
									<div class="btn join-item"><Icon icon="ic:baseline-photo-camera" /></div>
									<input
										type="text"
										class="join-item flex-grow px-2"
										placeholder="https://"
										bind:value={picture}
									/>
								</div>
							</label>
							<br />
							<button class="btn btn-accent mx-auto w-full" type="submit">Be free</button>
						</form>
						<p class="mx-4 text-xs text-gray-500 mt-4 p-1">
							Already on Nostr?<button
								class="btn btn-link text-accent"
								on:click={() => (kind = 'login')}>prove it</button
							>
						</p>
					</div>
				{/if}
			</div>
		</main>
	</div>
	<btn class="btn text-accent btn-link p-4 md:text-xl absolute md:right-4 right-2 top-4 pt-safe">
		{'</>'}
	</btn>
</main>
