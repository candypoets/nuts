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
	let pubkeyInput = '';
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
			[{ kinds: [kinds.Metadata], authors: [pubkey], limit: 3, relays: [] }],
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
				manager.setSigner('nip07');
				$key = {
					pub: pubkey,
					npub: nip19.npubEncode(pubkey),
					hasSigner: true
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
					const relayUrl = status.relayUrl();
					if (relayUrl) {
						sendStatus[relayUrl] = status;
						updateSendStatus('newWallet_' + pubkey, sendStatus);
					}
					console.log(relayUrl, status.message());
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
						connectionStatus.relayUrl,
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

	async function handlePubkeyLogin() {
		if (!pubkeyInput) return;

		// Handle npub
		if (pubkeyInput.startsWith('npub')) {
			try {
				const decoded = nip19.decode(pubkeyInput);
				if (decoded.type === 'npub') {
					const pubkey = decoded.data as string;
					manager.setSigner('pubkey', pubkey);
					// If we have an animator (inside modal), go back, otherwise redirect
					if (animator) {
						animator.goBack();
					} else if (redirect) {
						goto('/explore');
					}
				}
			} catch (e) {
				console.error('Invalid npub:', e);
			}
			return;
		}

		// Handle hex pubkey (64 character hex string)
		if (/^[0-9a-fA-F]{64}$/.test(pubkeyInput)) {
			manager.setSigner('pubkey', pubkeyInput);
			// If we have an animator (inside modal), go back, otherwise redirect
			if (animator) {
				animator.goBack();
			} else if (redirect) {
				goto('/explore');
			}
			return;
		}

		console.error('Invalid pubkey format');
	}

	async function handleQRConnect() {
		try {
			const res = await connectWithQRCode('Nuts', DEFAULT_RELAYS);
			// If we have an animator (inside app), use modal system
			if (animator) {
				// Must encode since nostrconnect:// contains special URL chars like // and ?
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
	class:mt-8={inline}
	class:px-2={inline}
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
					<span class="text-accent">Nuts</span> <span class="">Cash</span>
				</h1>
				<p class="text-sm" style="font-family: 'Rock Salt', cursive;">
					Private. Fast. Simple.
				</p>
			</div>
		{/if}

		{#if showQR && qrText}
			<!-- Inline QR Display for Login Page -->
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
				<div class="relative bg-base-300 rounded-2xl p-8 max-w-sm w-full border border-base-content/10">
					<button class="absolute top-4 right-4" on:click={closeQR}>
						<Icon icon="ri:close-line" class="text-2xl" />
					</button>
					<div class="flex flex-col items-center">
						<h3 class="text-lg font-semibold mb-4 text-base-content">Scan with your Nostr app</h3>
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
						<p class="text-sm mt-4 text-center text-base-content/70">
							Scan this QR code with a Nostr signer app to connect
						</p>
					</div>
				</div>
			</div>
		{/if}

		{#if kind == 'login'}
			<div class="w-full" class:mt-32={!inline}>
				<div class="px-4 space-y-4" class:!px-0={inline}>
					<!-- QR Scan Button - Prominent -->
					<button
						type="button"
						class="group relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-accent/20 via-accent/10 to-transparent border border-accent/30 hover:border-accent/50 transition-all duration-300"
						on:click={handleQRConnect}
					>
						<div class="flex items-center gap-4 p-4">
							<div class="flex-shrink-0">
								<div
									class="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
								>
									<Icon icon="ri:qr-scan-2-line" class="text-2xl text-accent" />
								</div>
							</div>
							<div class="flex-1 text-left">
								<p class="text-base-content font-medium">Scan with your phone</p>
								<p class="text-base-content/40 text-sm">Use a Nostr signer app</p>
							</div>
							<div class="flex-shrink-0">
								<Icon
									icon="ri:arrow-right-s-line"
									class="text-xl text-base-content/30 group-hover:text-accent group-hover:translate-x-1 transition-all"
								/>
							</div>
						</div>
					</button>

					<!-- Extension Login Button -->
					{#if hasExtension}
						<button
							type="button"
							class="group relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-base-content/5 via-base-content/[0.03] to-transparent border border-base-content/10 hover:border-base-content/20 hover:bg-base-content/5 transition-all duration-300"
							on:click={handleExtensionLogin}
							disabled={loading}
						>
							<div class="flex items-center gap-4 p-4">
								<div class="flex-shrink-0">
									<div
										class="w-12 h-12 rounded-xl bg-base-content/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
									>
										<Icon icon="ri:puzzle-2-line" class="text-2xl text-base-content/70" />
									</div>
								</div>
								<div class="flex-1 text-left">
									<p class="text-base-content font-medium">Browser extension</p>
									<p class="text-base-content/40 text-sm">Connect with your Nostr extension</p>
								</div>
								<div class="flex-shrink-0">
									<Icon
										icon="ri:arrow-right-s-line"
										class="text-xl text-base-content/30 group-hover:text-base-content/60 group-hover:translate-x-1 transition-all"
									/>
								</div>
							</div>
						</button>
					{/if}

					<!-- Divider -->
					<div class="relative py-2">
						<div class="absolute inset-0 flex items-center">
							<div class="w-full border-t border-base-content/10"></div>
						</div>
						<div class="relative flex justify-center">
							<span class="bg-base-300 px-4 text-xs text-base-content/30 uppercase tracking-wider"
								>or</span
							>
						</div>
					</div>

					<!-- Manual Key Input Form -->
					<form on:submit|preventDefault={handleLogin} class="space-y-4">
						<div class="relative">
							<div class="absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30">
								<Icon icon="ri:key-2-line" class="text-lg" />
							</div>
							{#if showPassword}
								<input
									placeholder="nsec or bunker url"
									class="w-full pl-11 pr-24 py-4 bg-base-content/5 border border-base-content/10 rounded-xl text-base-content placeholder:text-base-content/30 focus:outline-none focus:bg-base-content/[0.07] focus:border-accent/50 transition-all"
									type="text"
									bind:value={privateKey}
								/>
							{:else}
								<input
									placeholder="nsec or bunker url"
									class="w-full pl-11 pr-24 py-4 bg-base-content/5 border border-base-content/10 rounded-xl text-base-content placeholder:text-base-content/30 focus:outline-none focus:bg-base-content/[0.07] focus:border-accent/50 transition-all"
									type="password"
									bind:value={privateKey}
								/>
							{/if}
							<!-- Toggle visibility button -->
							<button
								type="button"
								class="absolute right-11 top-1/2 -translate-y-1/2 p-2 text-base-content/30 hover:text-base-content/60 transition-colors"
								on:click={() => (showPassword = !showPassword)}
								title={showPassword ? 'Hide' : 'Show'}
							>
								<Icon icon={showPassword ? 'ri:eye-off-line' : 'ri:eye-line'} class="text-lg" />
							</button>
							<!-- Clear button -->
							{#if privateKey}
								<button
									type="button"
									class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-base-content/30 hover:text-base-content/60 transition-colors"
									on:click={clearInput}
								>
									<Icon icon="ri:close-circle-fill" class="text-lg" />
								</button>
							{/if}
						</div>

						<!-- Sign In Button - Full width below input -->
						<button
							class="w-full py-4 rounded-xl bg-accent hover:bg-accent/90 text-accent-content font-semibold text-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20 hover:shadow-accent/30 hover:scale-[1.02] active:scale-[0.98]"
							type="submit"
							disabled={loading || !privateKey}
						>
							{#if !loading}
								<Icon icon="ri:login-circle-line" class="text-xl" />
								<span>Sign In</span>
							{:else}
								<span class="loading loading-spinner loading-sm"></span>
								<span>Signing in...</span>
							{/if}
						</button>
					</form>

					<!-- Divider -->
					<div class="relative py-2">
						<div class="absolute inset-0 flex items-center">
							<div class="w-full border-t border-base-content/10"></div>
						</div>
						<div class="relative flex justify-center">
							<span class="bg-base-300 px-4 text-xs text-base-content/30 uppercase tracking-wider"
								>read-only</span
							>
						</div>
					</div>

					<!-- Read-Only Pubkey Form -->
					<form on:submit|preventDefault={handlePubkeyLogin} class="space-y-4 pt-2">
						<div class="relative">
							<div class="absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30">
								<Icon icon="ri:eye-line" class="text-lg" />
							</div>
							<input
								placeholder="npub or hex pubkey"
								class="w-full pl-11 pr-12 py-4 bg-base-content/5 border border-base-content/10 rounded-xl text-base-content placeholder:text-base-content/30 focus:outline-none focus:bg-base-content/[0.07] focus:border-accent/50 transition-all"
								type="text"
								bind:value={pubkeyInput}
							/>
							<!-- Clear button -->
							{#if pubkeyInput}
								<button
									type="button"
									class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-base-content/30 hover:text-base-content/60 transition-colors"
									on:click={() => (pubkeyInput = '')}
								>
									<Icon icon="ri:close-circle-fill" class="text-lg" />
								</button>
							{/if}
						</div>

						<button
							class="w-full py-3 rounded-xl bg-base-content/10 hover:bg-base-content/20 text-base-content font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
							type="button"
							disabled={!pubkeyInput}
							on:click={handlePubkeyLogin}
						>
							<Icon icon="ri:eye-line" class="text-xl" />
							<span>Read-Only Access</span>
						</button>
					</form>

					<!-- Sign up link -->
					<div class="text-center pt-4">
						<p class="text-sm text-base-content/40">
							Not on Nostr yet?
							<button
								class="text-accent hover:text-accent/80 font-medium ml-1 transition-colors"
								on:click={() => (kind = 'signup')}
							>
								Create account
							</button>
						</p>
					</div>
				</div>
			</div>
		{:else}
			<!-- Sign up form -->
			<div class="px-4" class:!px-0={inline}>
				<form on:submit|preventDefault={handleSignup} class="space-y-4">
					<!-- Handle input -->
					<div class="form-control">
						<label class="label">
							<span class="label-text text-base-content/70 flex items-center gap-2">
								<Icon icon="ri:user-smile-line" />
								Handle
							</span>
						</label>
						<div class="join w-full">
							<div class="btn join-item btn-outline border-base-content/10 text-base-content/50 bg-base-content/5">
								<Icon icon="ri:at-line" />
							</div>
							<input
								type="text"
								class="join-item flex-grow px-4 bg-base-content/5 border-y border-base-content/10 text-base-content placeholder:text-base-content/30 focus:outline-none focus:bg-base-content/10 transition-colors"
								bind:value={name}
								placeholder="yourname"
							/>
						</div>
					</div>

					<!-- About textarea -->
					<div class="form-control">
						<label class="label">
							<span class="label-text text-base-content/70 flex items-center gap-2">
								<Icon icon="ri:file-text-line" />
								About You <span class="text-base-content/30">(optional)</span>
							</span>
						</label>
						<textarea
							class="w-full p-4 bg-base-content/5 border border-base-content/10 rounded-lg text-base-content placeholder:text-base-content/30 focus:outline-none focus:bg-base-content/10 focus:border-accent/50 transition-all resize-none"
							rows="3"
							bind:value={about}
							placeholder="Tell us a bit about yourself..."
						></textarea>
					</div>

					<!-- Picture input -->
					<div class="form-control">
						<label class="label">
							<span class="label-text text-base-content/70 flex items-center gap-2">
								<Icon icon="ri:image-line" />
								Profile Picture <span class="text-base-content/30">(optional)</span>
							</span>
						</label>
						<div class="join w-full">
							<div class="btn join-item btn-outline border-base-content/10 text-base-content/50 bg-base-content/5">
								<Icon icon="ri:link" />
							</div>
							<input
								type="text"
								class="join-item flex-grow px-4 bg-base-content/5 border-y border-base-content/10 text-base-content placeholder:text-base-content/30 focus:outline-none focus:bg-base-content/10 transition-colors"
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
					<p class="text-sm text-base-content/40">
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
