<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ConnectionStatus, getManager, type WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isKind0, connectWithQRCode } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import { generateMnemonic, validateMnemonic } from '@scure/bip39';
	import { wordlist } from '@scure/bip39/wordlists/english';
	import imageCompression from 'browser-image-compression';
	import { getPublicKey, kinds, nip19, type EventTemplate } from 'nostr-tools';

	import { key, walletMnemonic, walletMnemonicIndex, walletPassphrase } from 'src/controller';
	import { setNutsWallet } from 'src/controller/proofs';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import { now } from 'src/lib/period';
	import { uploadFile } from 'src/lib/upload';
	import { decodePrivKey, DEFAULT_MINTS, deriveFromMnemonic } from 'src/lib/wallet';
	import { go } from 'src/routes/modals/modal';
	import { getContext, onMount } from 'svelte';
	import { QRCodeImage } from 'svelte-qrcode-image';

	export let inline = false;
	export let redirect = false;
	export let initialKind: 'login' | 'signup' = 'login';

	const animator = getContext('animator');

	let privateKey = '';
	let pubkeyInput = '';
	let name = '';
	let picture = '';
	let pictureName = '';
	let pictureFile: File | undefined;
	let about = '';

	let loading = false;
	let hasExtension = false;
	let uploadError = '';
	let isPictureUploading = false;

	let kind: 'login' | 'signup' = initialKind;
	let showPassword = false;
	let showQR = false;
	let qrText = '';

	const blossomProfileServer = 'https://blossom.nuts.cash';

	const manager = getManager();

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
						goto(resolve('/explore'));
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
					goto(resolve('/explore'));
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

	function readPictureFile(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			uploadError = 'Choose an image file.';
			return;
		}
		uploadError = '';
		pictureFile = file;
		pictureName = file.name;
		const reader = new FileReader();
		reader.onload = () => {
			picture = typeof reader.result === 'string' ? reader.result : '';
		};
		reader.readAsDataURL(file);
	}

	async function compressProfilePicture(file: File) {
		if (!file.type.startsWith('image/')) return file;
		return await imageCompression(file, {
			maxSizeMB: 0.35,
			maxWidthOrHeight: 512,
			useWebWorker: true,
			fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
			initialQuality: 0.82
		});
	}

	async function uploadProfilePicture() {
		if (!pictureFile) return '';
		isPictureUploading = true;
		uploadError = '';
		try {
			const compressed = await compressProfilePicture(pictureFile);
			const result = await uploadFile(compressed, {
				server: blossomProfileServer,
				serverType: 'blossom',
				preferUserServers: false,
				alt: name.trim() || compressed.name || pictureFile.name,
				includeMimeTag: true,
				includeDimensions: true
			});
			picture = result.url;
			return result.url;
		} catch (error) {
			uploadError =
				error instanceof Error ? error.message : 'Profile picture upload failed. Please try again.';
			return '';
		} finally {
			isPictureUploading = false;
		}
	}

	async function handleSignup() {
		const trimmedName = name.trim();
		if (!trimmedName) return;

		loading = true;
		uploadError = '';
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

		const uploadedPicture = await uploadProfilePicture();
		if (pictureFile && !uploadedPicture) {
			loading = false;
			return;
		}

		let event: EventTemplate = {
			kind: 0,
			tags: [],
			content: JSON.stringify({
				name: trimmedName,
				about: about.trim(),
				picture: uploadedPicture || undefined
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
					console.log('relayUrl', connectionStatus.relayUrl, connectionStatus.status.toString());
				}
				saveWallet();
				loading = false;
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
						goto(resolve('/explore'));
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
				goto(resolve('/explore'));
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

<main class={inline ? 'w-full' : 'flex h-screen w-full items-center justify-center bg-base-200/20 px-2'}>
	<div class={inline ? 'w-full' : 'w-full max-w-xl md:px-4'}>
		{#if !inline}
			<div class="text-center mb-8">
				<h1
					class="text-5xl md:text-7xl font-bold mb-4"
					style="font-family: 'Permanent Marker', cursive;"
				>
					<span class="text-accent">Nuts</span> <span class="">Cash</span>
				</h1>
				<p class="text-sm" style="font-family: 'Rock Salt', cursive;">Private. Fast. Simple.</p>
			</div>
		{/if}

		{#if showQR && qrText}
			<!-- Inline QR Display for Login Page -->
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
				<div
					class="relative bg-base-300 rounded-2xl p-8 max-w-sm w-full border border-base-content/10"
				>
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
					<div class="mb-6">
						<p class="text-sm font-semibold text-accent">Welcome back</p>
						<h2 class="mt-1 text-3xl font-black leading-tight text-base-content">Connect your keys</h2>
						<p class="mt-2 max-w-prose text-sm leading-6 text-base-content/60">
							Use a signer, extension, private key, or read-only public key.
						</p>
					</div>

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
							New to Nuts?
							<button
								class="text-accent hover:text-accent/80 font-medium ml-1 transition-colors"
								on:click={() => (kind = 'signup')}
							>
								Create a profile
							</button>
						</p>
					</div>
				</div>
			</div>
		{:else}
			<div class="px-4" class:!px-0={inline}>
				<div class="mb-6">
					<p class="text-sm font-semibold text-accent">Join Nuts</p>
					<h2 class="mt-1 text-3xl font-black leading-tight text-base-content">Create your profile</h2>
					<p class="mt-2 max-w-prose text-sm leading-6 text-base-content/60">
						Pick a name people will recognize. Your keys stay on this device.
					</p>
				</div>

				<form on:submit|preventDefault={handleSignup} class="space-y-5">
					<label class="block">
						<span class="mb-2 flex items-center gap-2 text-sm font-semibold text-base-content/70">
							<Icon icon="ri:user-smile-line" />
							Display name
						</span>
						<input
							type="text"
							class="w-full rounded-xl border border-base-content/10 bg-base-content/[0.04] px-4 py-4 text-base-content placeholder:text-base-content/30 transition-all focus:border-accent/50 focus:bg-base-content/[0.07] focus:outline-none focus:ring-2 focus:ring-accent/10"
							bind:value={name}
							placeholder="Marie from the cycling club"
							autocomplete="name"
						/>
					</label>

					<label class="block">
						<span class="mb-2 flex items-center gap-2 text-sm font-semibold text-base-content/70">
							<Icon icon="ri:file-text-line" />
							About <span class="font-normal text-base-content/35">optional</span>
						</span>
						<textarea
							class="min-h-24 w-full resize-none rounded-xl border border-base-content/10 bg-base-content/[0.04] px-4 py-3 text-base-content placeholder:text-base-content/30 transition-all focus:border-accent/50 focus:bg-base-content/[0.07] focus:outline-none focus:ring-2 focus:ring-accent/10"
							rows="3"
							bind:value={about}
							placeholder="Organizer, coach, neighbor, parent..."
						></textarea>
					</label>

					<label class="block">
						<span class="mb-2 flex items-center gap-2 text-sm font-semibold text-base-content/70">
							<Icon icon="ri:image-line" />
							Profile picture <span class="font-normal text-base-content/35">optional</span>
						</span>
						<input class="sr-only" type="file" accept="image/*" on:change={readPictureFile} />
						<div
							class="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-base-content/20 bg-base-content/[0.035] p-4 transition hover:border-accent/40 hover:bg-base-content/[0.055]"
						>
							<div
								class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-base-content/10 text-base-content/45"
							>
								{#if picture}
									<img class="h-full w-full object-cover" src={picture} alt="Selected profile preview" />
								{:else}
									<Icon icon="ri:image-add-line" class="text-3xl" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="font-semibold text-base-content">
									{pictureName || 'Upload from your computer'}
								</p>
								<p class="mt-1 text-sm text-base-content/50">
									Stored on blossom.nuts.cash when you create the profile.
								</p>
							</div>
							<Icon icon="ri:upload-cloud-2-line" class="text-2xl text-base-content/35" />
						</div>
					</label>

					{#if uploadError}
						<div class="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
							{uploadError}
						</div>
					{/if}

					<button
						class="w-full rounded-xl bg-accent px-5 py-4 font-bold text-accent-content shadow-lg shadow-accent/20 transition hover:bg-accent/90 hover:shadow-accent/30 focus:outline-none focus:ring-2 focus:ring-accent/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
						type="submit"
						disabled={loading || isPictureUploading || !name.trim()}
					>
						{#if loading || isPictureUploading}
							<span class="loading loading-spinner loading-sm"></span>
							<span>{isPictureUploading ? 'Uploading picture...' : 'Creating profile...'}</span>
						{:else}
							<span>Create profile</span>
						{/if}
					</button>
				</form>

				<!-- Back to login -->
				<div class="mt-6 text-center">
					<p class="text-sm text-base-content/40">
						Already have keys?
						<button
							class="btn btn-link btn-sm text-accent hover:text-accent/80 no-underline gap-1"
							on:click={() => (kind = 'login')}
						>
							<Icon icon="ri:login-circle-line" />
							Connect instead
						</button>
					</p>
				</div>
			</div>
		{/if}
	</div>
</main>
