<script lang="ts">
	import Icon from '@iconify/svelte';
	import { QRCodeImage } from 'svelte-qrcode-image';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { nip19, type NostrEvent } from 'nostr-tools';
	import { useSignEvent } from '@candypoets/nipworker/hooks';

	import { key, readRelays } from 'src/controller';
	import { encodePresentation, presentationTemplate } from 'src/lib/presentation';

	export let qrText: string | undefined = undefined;

	let animator = getContext<{ goBack: () => void }>('animator');

	let copied = false;
	let mode: 'profile' | 'checkin' = 'profile';
	let signedPresentation = '';
	let presentationStatus = '';
	let presentationExpiresAt = 0;
	let secondsRemaining = 0;
	let signingPresentation = false;
	let presentationTimer: ReturnType<typeof setInterval> | undefined;

	// Function to decode relay URLs that might still be encoded
	function decodeQrText(text: string | undefined): string {
		if (!text) return '';
		// If text contains encoded characters (like relay URLs), decode them
		if (text.includes('%3A') || text.includes('%2F')) {
			try {
				return decodeURIComponent(text);
			} catch (e) {
				console.warn('Failed to decode QR text:', e);
			}
		}
		return text;
	}

	$: profileQrText = $key?.pub
		? `nostr:${nip19.nprofileEncode({ pubkey: $key.pub, relays: ($readRelays || []).slice(0, 4) })}`
		: '';
	$: derivedQrText = decodeQrText(qrText) || (mode === 'checkin' ? signedPresentation : profileQrText);
	$: passStatus = signingPresentation
		? signedPresentation ? `Renewing · ${secondsRemaining}s remaining` : 'Signing your temporary pass…'
		: presentationStatus || (signedPresentation ? `Valid for ${secondsRemaining}s` : 'Preparing signed identity…');

	function selectMode(nextMode: 'profile' | 'checkin') {
		mode = nextMode;
		copied = false;
		if (nextMode === 'checkin' && (!signedPresentation || secondsRemaining <= 30)) {
			createPresentation();
		}
	}

	function createPresentation() {
		if (qrText || !$key?.pub || signingPresentation) return;
		signingPresentation = true;
		presentationStatus = 'Signing your temporary pass…';
		try {
			useSignEvent(presentationTemplate(), (signed) => {
				try {
					const event = (typeof signed === 'string' ? JSON.parse(signed) : signed) as NostrEvent;
					signedPresentation = encodePresentation(event);
					presentationExpiresAt = Number(
						event.tags.find((tag) => tag[0] === 'expiration')?.[1] || event.created_at + 90
					);
					secondsRemaining = Math.max(0, presentationExpiresAt - Math.floor(Date.now() / 1000));
					presentationStatus = '';
				} catch {
					presentationStatus = 'Could not create the signed pass';
				} finally {
					signingPresentation = false;
				}
			});
		} catch {
			presentationStatus = 'Could not create the signed pass';
			signingPresentation = false;
		}
	}

	onMount(() => {
		presentationTimer = setInterval(() => {
			secondsRemaining = Math.max(0, presentationExpiresAt - Math.floor(Date.now() / 1000));
			if (mode === 'checkin' && presentationExpiresAt && secondsRemaining <= 30) {
				createPresentation();
			}
		}, 1000);
	});

	onDestroy(() => {
		if (presentationTimer) clearInterval(presentationTimer);
	});

	async function copyToClipboard() {
		if (!derivedQrText) return;
		
		// Try modern Clipboard API first
		if (navigator.clipboard && window.isSecureContext) {
			try {
				await navigator.clipboard.writeText(derivedQrText);
				copied = true;
				setTimeout(() => (copied = false), 2000);
				return;
			} catch (err) {
				console.warn('Clipboard API failed, trying fallback:', err);
			}
		}
		
		// Fallback: use hidden textarea and execCommand
		try {
			const textarea = document.createElement('textarea');
			textarea.value = derivedQrText;
			textarea.style.position = 'fixed';
			textarea.style.left = '-9999px';
			textarea.style.top = '0';
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();
			const success = document.execCommand('copy');
			document.body.removeChild(textarea);
			
			if (success) {
				copied = true;
				setTimeout(() => (copied = false), 2000);
			} else {
				console.error('execCommand copy failed');
			}
		} catch (err) {
			console.error('Fallback copy failed:', err);
		}
	}

</script>

<div
	class="top-0 w-feed flex items-center justify-center z-10 mobile-height bg-base-300 bg-opacity-85 pt-safe"
>
	<button
		type="button"
		class="absolute left-4 top-4 cursor-pointer"
		aria-label="Close QR code"
		on:click|stopPropagation={animator.goBack}
	>
		<Icon icon="mingcute:down-line" class="text-xl" />
	</button>
	<div class="flex items-center justify-center flex-col gap-5 px-5">
		<!-- Label for the QR code -->
		<div class="text-center">
			<h2 class="text-lg font-semibold">Your QR</h2>
			<p class="text-sm text-base-content/60">
				{qrText ? 'Scan to continue' : mode === 'profile' ? 'Share your Nostr profile' : passStatus}
			</p>
		</div>
		{#if !qrText}
			<div class="grid w-full max-w-[320px] grid-cols-2 rounded-xl bg-base-200 p-1" aria-label="QR type">
				<button
					type="button"
					class={`rounded-lg px-4 py-2.5 text-sm font-black transition ${mode === 'profile' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/55'}`}
					aria-pressed={mode === 'profile'}
					on:click={() => selectMode('profile')}
				>
					Profile
				</button>
				<button
					type="button"
					class={`rounded-lg px-4 py-2.5 text-sm font-black transition ${mode === 'checkin' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/55'}`}
					aria-pressed={mode === 'checkin'}
					on:click={() => selectMode('checkin')}
				>
					Check-in pass
				</button>
			</div>
		{/if}
		<!-- QR Code with hover effect -->
		<button
			class="relative group cursor-pointer p-4 rounded-xl bg-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
			on:click={copyToClipboard}
			aria-label="Copy QR code content"
		>
			{#if derivedQrText}
				<QRCodeImage
					text={derivedQrText}
					displayType="canvas"
					displayHeight={280}
					displayWidth={280}
					margin={2}
					errorCorrectionLevel="M"
					displayClass="rounded-md"
				/>
			{:else}
				<div class="grid h-[280px] w-[280px] place-items-center text-gray-500">
					<Icon icon="ei:spinner" class="h-10 w-10 animate-spin" />
				</div>
			{/if}
			<!-- Hover overlay with copy icon -->
			<div
				class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 rounded-xl transition-all duration-200"
			>
				<Icon
					icon="heroicons:clipboard-document"
					class="w-12 h-12 text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-md"
				/>
			</div>
		</button>

		<!-- Copy button below QR -->
		{#if !qrText && mode === 'checkin'}
			<div class="flex items-center gap-2 text-xs font-bold text-base-content/55">
				<Icon icon="heroicons:shield-check" class="h-4 w-4 text-success" />
				Automatically renews while this screen is open
			</div>
		{/if}
		<button
			class="btn btn-outline btn-sm gap-2 {copied ? 'btn-success' : ''}"
			on:click={copyToClipboard}
			disabled={!navigator.clipboard && !window.isSecureContext}
			title={!window.isSecureContext ? 'Copy requires HTTPS' : ''}
		>
			<Icon icon={copied ? 'heroicons:check' : 'heroicons:clipboard-document'} class="w-4 h-4" />
			<span>{copied ? 'Copied!' : 'Copy to clipboard'}</span>
		</button>
		
		<!-- HTTPS warning -->
		{#if !window.isSecureContext}
			<div class="text-xs text-warning flex items-center gap-1">
				<Icon icon="heroicons:exclamation-triangle" class="w-3 h-3" />
				<span>Copy requires HTTPS</span>
			</div>
		{/if}

		<!-- Show truncated text -->
		{#if derivedQrText && (qrText || mode === 'profile')}
			<div class="text-sm text-base-content/60 max-w-[300px] text-center break-all px-4">
				{derivedQrText.slice(0, 24)}...{derivedQrText.slice(-16)}
			</div>
		{/if}
	</div>
</div>
