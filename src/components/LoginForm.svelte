<script lang="ts">
	import { goto } from '$app/navigation';
	import { ConnectionStatus, manager, type WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isKind0, connectWithQRCode } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import { generateMnemonic, validateMnemonic } from '@scure/bip39';
	import { wordlist } from '@scure/bip39/wordlists/english';
	import { getPublicKey, kinds, nip19, type EventTemplate } from 'nostr-tools';

	import { key, walletMnemonic, walletMnemonicIndex, walletPassphrase } from 'src/controller';
	import { setNutsWallet } from 'src/controller/proofs';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import { now } from 'src/lib/period';
	import { pronounceable } from 'src/lib/randomName';
	import { decodePrivKey, DEFAULT_MINTS, deriveFromMnemonic } from 'src/lib/wallet';
	import { go } from 'src/routes/modals/modal';
	import { getContext, onMount } from 'svelte';

	export let inline = false;
	export let redirect = false;

	const animator = getContext('animator');

	let privateKey = '';
	let name = pronounceable({ min: 6, max: 8 });
	let picture = '';
	let about = '';

	let loading = false;
	let hasExtension = false;

	let kind: 'login' | 'signup' = 'login';

	onMount(async () => {
		if (window?.nostr) {
			hasExtension = true;
		}
		if (window.localStorage.getItem('nostr-privkey')) {
			// backward compatibility
			privateKey = window.localStorage.getItem('nostr-privkey');
			handleLogin();
		}
	});

	async function handleLogin() {
		if (!privateKey) return;
		// Handle login logic here
		//
		if (privateKey.startsWith('bunker://')) {
			manager.setNip46Bunker(privateKey);
			return;
		}

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
					animator?.goBack();
				}
			}
		);
	}

	async function handleExtensionLogin() {
		try {
			loading = true;
			const pubkey = await window.nostr.getPublicKey();
			if (pubkey) {
				manager.setSigner('nip07');
				$key = {
					pub: pubkey,
					npub: nip19.npubEncode(pubkey)
				};
				animator?.goBack();
			}
		} catch (e) {
			console.error(e);
		} finally {
			loading = false;
		}
	}

	function saveWallet() {
		const selectedMints = DEFAULT_MINTS.slice();
		const inputMnemonic = generateMnemonic(wordlist, 128);
		const mnemonicIndex = 0;
		const secretKey = deriveFromMnemonic(inputMnemonic, '', mnemonicIndex);
		console.log(secretKey, inputMnemonic);
		const pubkey = getPublicKey(secretKey);
		const newWallet: EventTemplate = {
			kind: 17375,
			created_at: now(),
			content: JSON.stringify([
				['privkey', bytesToHex(secretKey)],
				...selectedMints.map((sm) => ['mint', sm])
			]),
			tags: []
		};
		const trustedMints: EventTemplate = {
			kind: 10019,
			created_at: now(),
			content: '',
			tags: [...selectedMints.map((sm) => ['mint', sm]), ['pubkey', pubkey]]
		};

		// Persist mnemonic locally when applicable
		const trimmed = (inputMnemonic || '').trim();
		if (trimmed && validateMnemonic(trimmed, wordlist)) {
			$walletMnemonic = trimmed;
			$walletMnemonicIndex = mnemonicIndex;
		}

		let sendStatus: { [url: string]: ConnectionStatus } = {};

		usePublish(
			'newWallet',
			newWallet,
			(message) => {
				const status = isConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl()?.toString();
					if (relayUrl) {
						sendStatus[relayUrl] = status;
						updateSendStatus('newWallet_' + pubkey, sendStatus);
					}
					console.log(relayUrl, status.message()?.toString());
					// $key.pub = pubkey;
					setNutsWallet(bytesToHex(secretKey), pubkey, selectedMints, now());
					if (redirect) {
						// goto('/home');
					}
				}
			},
			{ trackStatus: true, defaultRelays: DEFAULT_RELAYS }
		);

		usePublish('trustedMints', trustedMints, (message) => console.log('trustedMints', message), {
			trackStatus: true,
			defaultRelays: DEFAULT_RELAYS
		});
	}

	async function handleSignup() {
		const priv = schnorr.utils.randomSecretKey();
		const privkey = bytesToHex(priv);
		const pubkey = bytesToHex(schnorr.getPublicKey(priv));

		// Handle signup logic here
		//
		manager.setSigner('privKey', privkey);

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
		usePublish(
			'signup',
			event,
			(message: WorkerMessage) => {
				console.log('message', message);
				const connectionStatus = isConnectionStatus(message);
				if (connectionStatus) {
					console.log(
						'relayUrl',
						connectionStatus.relayUrl?.toString(),
						connectionStatus.status.toString()
					);
				}
				saveWallet();
			},
			{ trackStatus: true, defaultRelays: DEFAULT_RELAYS }
		);
	}
</script>

<main
	class="w-full h-screen flex justify-center items-center"
	class:!block={inline}
	class:!h-auto={inline}
>
	<div class="w-full md:px-4">
		<h1 class="text-5xl md:text-7xl font-bold px-4" class:hidden={inline}>
			<span class="text-purple-600">Nuts</span> <span class="text-primary">Cash</span>
			<span class="text-purple-600"> {'<'}</span>
		</h1>
		<br />
		<h1 class="md:text-6xl text-5xl font-bold px-4" class:hidden={inline}>
			<span class="text-purple-600">{'>'}</span> <span class="text-primary">Speak</span>
			<span class="text-purple-600">Up</span>
		</h1>
		{#if kind == 'login'}
			<div class="w-full mt-32">
				<form class="px-4 mt-8" class:!mt-0={inline} on:submit|preventDefault={handleLogin}>
					<div class="join w-full">
						<button
							class="btn join-item btn-outline"
							on:click={() =>
								connectWithQRCode('Nuts', DEFAULT_RELAYS).then((res) =>
									go('qr:' + encodeURIComponent(res))
								)}><Icon icon="ri:qr-code-fill" /></button
						>
						<!-- <div class="btn join-item btn-link"><Icon icon="ri:key-fill" /></div> -->
						<input
							placeholder="nsec or bunker url"
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
				{#if hasExtension}
					<div>
						<button
							class="btn btn-outline mt-4 mx-auto flex"
							on:click={handleExtensionLogin}
							disabled={loading}
						>
							{#if loading}
								<div class="loading" />
							{:else}
								<Icon icon="ri:puzzle-fill" />
								Connect with extension
							{/if}
						</button>
					</div>
				{/if}
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
					Already on Nostr?
					<button class="btn btn-link text-accent" on:click={() => (kind = 'login')}
						>prove it</button
					>
					{#if hasExtension}
						or
						<button class="btn btn-link text-accent mx-12" on:click={handleExtensionLogin}
							>connect with extension</button
						>
					{/if}
				</p>
			</div>
		{/if}
	</div>
</main>
