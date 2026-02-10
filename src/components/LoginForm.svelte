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
	import { QRCodeImage } from 'svelte-qrcode-image';

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
	let showPassword = false;
	let showQR = false;
	let qrText = '';

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
					// $key = {
					// 	pub: pubkey,
					// 	priv: privkey,
					// 	npub: nip19.npubEncode(pubkey),
					// 	nsec: nip19.nsecEncode(pk)
					// };
					manager.setSigner('privkey', privkey);
					loginSub();
					// If we have an animator (inside modal), go back, otherwise redirect
					if (animator) {
						animator.goBack();
					} else if (redirect) {
						goto('/explore');
					}
				}
			}
		);
	}

	async function handleExtensionLogin() {
		try {
			loading = true;
			const pubkey = await window.nostr.getPublicKey();
			if (pubkey) {
			    console.log('set signer')
				manager.setSigner('nip07');
				$key = {
					pub: pubkey,
					npub: nip19.npubEncode(pubkey)
				};
				// If we have an animator (inside modal), go back, otherwise redirect
				if (animator) {
					animator.goBack();
				} else {
					goto('/explore');
				}
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
		manager.setSigner('privkey', privkey);

		// $key = {
		// 	pub: pubkey,
		// 	priv: privkey,
		// 	npub: nip19.npubEncode(pubkey),
		// 	nsec: nip19.nsecEncode(priv)
		// };

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

	function clearInput() {
		privateKey = '';
	}

	async function handleQRConnect() {
		try {
			const res = await connectWithQRCode('Nuts', DEFAULT_RELAYS);
			// If we have an animator (inside app), use modal system
			if (animator) {
				go('qr:' + encodeURIComponent(res));
			} else {
				// On login page, show inline QR
				qrText = res;
				showQR = true;
			}
		} catch (e) {
			console.error('QR Connect error:', e);
		}
	}

	function closeQR() {
		showQR = false;
		qrText = '';
	}
</script>

<main
	class="w-full h-screen flex justify-center items-center"
	class:!block={inline}
	class:!h-auto={inline}
>
	<div class="w-full md:px-4">
		{#if !inline}
			<div class="text-center mb-8">
				<h1
					class="text-5xl md:text-7xl font-bold mb-4"
					style="font-family: 'Permanent Marker', cursive;"
				>
					<span class="text-accent">Nuts</span> <span class="text-white">Cash</span>
				</h1>
				<p class="text-white/50 text-sm" style="font-family: 'Rock Salt', cursive;">
					Private. Fast. Simple.
				</p>
			</div>
		{/if}

		{#if showQR && qrText}
			<!-- Inline QR Display for Login Page -->
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
				<div class="relative bg-neutral-900 rounded-2xl p-8 max-w-sm w-full border border-white/10">
					<button
						class="absolute top-4 right-4 text-white/50 hover:text-white"
						on:click={closeQR}
					>
						<Icon icon="ri:close-line" class="text-2xl" />
					</button>
					<div class="flex flex-col items-center">
						<h3 class="text-lg font-semibold mb-4 text-white">Scan with your Nostr app</h3>
						<div class="bg-white rounded-2xl p-4">
							<QRCodeImage
								text={qrText}
								displayType="canvas"
								displayHeight={250}
								displayWidth={250}
								margin={2}
								errorCorrectionLevel="H"
								displayClass="rounded-xl"
							/>
						</div>
						<p class="text-sm text-white/50 mt-4 text-center">
							Scan this QR code with a Nostr signer app to connect
						</p>
					</div>
				</div>
			</div>
		{/if}

		{#if kind == 'login'}
			<div class="w-full" class:mt-32={!inline}>
				<form class="px-4" class:!mt-0={inline} class:!px-0={inline} on:submit|preventDefault={handleLogin}>
					<div class="flex flex-col sm:flex-row gap-3">
						<!-- Input row -->
						<div class="join w-full flex-1">
							<!-- QR Scan button -->
							<button
								type="button"
								class="btn join-item btn-outline border-white/10 hover:bg-white/5 hover:border-white/20 text-white/70"
								on:click={handleQRConnect}
								title="Scan QR code"
							>
								<Icon icon="ri:qr-scan-2-line" class="text-lg" />
							</button>

							<!-- Input field -->
							<div class="relative flex-grow">
								{#if showPassword}
									<input
										placeholder="nsec or bunker url"
										class="join-item w-full px-4 py-3 bg-white/5 border-y border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10 transition-colors"
										type="text"
										bind:value={privateKey}
									/>
								{:else}
									<input
										placeholder="nsec or bunker url"
										class="join-item w-full px-4 py-3 bg-white/5 border-y border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10 transition-colors"
										type="password"
										bind:value={privateKey}
									/>
								{/if}
								<!-- Clear button -->
								{#if privateKey}
									<button
										type="button"
										class="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
										on:click={clearInput}
									>
										<Icon icon="ri:close-circle-fill" class="text-lg" />
									</button>
								{/if}
							</div>

							<!-- Toggle visibility button -->
							<button
								type="button"
								class="btn join-item btn-outline border-white/10 hover:bg-white/5 hover:border-white/20 text-white/70"
								on:click={() => showPassword = !showPassword}
								title={showPassword ? 'Hide' : 'Show'}
							>
								<Icon icon={showPassword ? "ri:eye-off-line" : "ri:eye-line"} class="text-lg" />
							</button>
						</div>

						<!-- Submit button - full width on mobile, auto width on sm+ -->
						<button
							class="btn btn-accent w-full sm:w-auto"
							type="submit"
							disabled={loading || !privateKey}
						>
							{#if !loading}
								<span class="flex items-center gap-2">
									<Icon icon="ri:login-circle-line" />
									<span>Sign In</span>
								</span>
							{:else}
								<span class="loading loading-spinner loading-sm"></span>
							{/if}
						</button>
					</div>
				</form>

				<!-- Extension login -->
				{#if hasExtension}
					<div class="mt-4 px-4" class:!px-0={inline}>
						<button
							class="btn btn-outline btn-block border-white/10 hover:bg-white/5 hover:border-white/20 text-white/70 gap-2"
							on:click={handleExtensionLogin}
							disabled={loading}
						>
							{#if loading}
								<span class="loading loading-spinner loading-sm"></span>
							{:else}
								<Icon icon="ri:puzzle-2-line" class="text-lg" />
								<span>Connect with Nostr Extension</span>
							{/if}
						</button>
					</div>
				{/if}

				<!-- Sign up link -->
				<div class="mt-6 text-center px-4" class:!px-0={inline}>
					<p class="text-sm text-white/40">
						Not on Nostr yet?
						<button
							class="btn btn-link btn-sm text-accent hover:text-accent/80 no-underline gap-1"
							on:click={() => (kind = 'signup')}
						>
							<Icon icon="ri:user-add-line" />
							Create account
						</button>
					</p>
				</div>
			</div>
		{:else}
			<!-- Sign up form -->
			<div class="px-4" class:!px-0={inline}>
				<form on:submit|preventDefault={handleSignup} class="space-y-4">
					<!-- Handle input -->
					<div class="form-control">
						<label class="label">
							<span class="label-text text-white/70 flex items-center gap-2">
								<Icon icon="ri:user-smile-line" />
								Handle
							</span>
						</label>
						<div class="join w-full">
							<div class="btn join-item btn-outline border-white/10 text-white/50 bg-white/5">
								<Icon icon="ri:at-line" />
							</div>
							<input
								type="text"
								class="join-item flex-grow px-4 bg-white/5 border-y border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10 transition-colors"
								bind:value={name}
								placeholder="yourname"
							/>
						</div>
					</div>

					<!-- About textarea -->
					<div class="form-control">
						<label class="label">
							<span class="label-text text-white/70 flex items-center gap-2">
								<Icon icon="ri:file-text-line" />
								About You <span class="text-white/30">(optional)</span>
							</span>
						</label>
						<textarea
							class="w-full p-4 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10 focus:border-accent/50 transition-all resize-none"
							rows="3"
							bind:value={about}
							placeholder="Tell us a bit about yourself..."
						></textarea>
					</div>

					<!-- Picture input -->
					<div class="form-control">
						<label class="label">
							<span class="label-text text-white/70 flex items-center gap-2">
								<Icon icon="ri:image-line" />
								Profile Picture <span class="text-white/30">(optional)</span>
							</span>
						</label>
						<div class="join w-full">
							<div class="btn join-item btn-outline border-white/10 text-white/50 bg-white/5">
								<Icon icon="ri:link" />
							</div>
							<input
								type="text"
								class="join-item flex-grow px-4 bg-white/5 border-y border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10 transition-colors"
								placeholder="https://..."
								bind:value={picture}
							/>
						</div>
					</div>

					<!-- Submit button -->
					<button
						class="btn btn-accent w-full mt-6 gap-2"
						type="submit"
						disabled={loading || !name}
					>
						{#if loading}
							<span class="loading loading-spinner loading-sm"></span>
							<span>Creating...</span>
						{:else}
							<Icon icon="ri:rocket-line" class="text-lg" />
							<span>Create Account</span>
						{/if}
					</button>
				</form>

				<!-- Back to login -->
				<div class="mt-6 text-center">
					<p class="text-sm text-white/40">
						Already have an account?
						<button
							class="btn btn-link btn-sm text-accent hover:text-accent/80 no-underline gap-1"
							on:click={() => (kind = 'login')}
						>
							<Icon icon="ri:login-circle-line" />
							Sign in
						</button>
					</p>
				</div>
			</div>
		{/if}
	</div>
</main>
