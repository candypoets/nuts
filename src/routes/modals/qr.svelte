<script lang="ts">
	import Icon from '@iconify/svelte';
	import { QRCodeImage } from 'svelte-qrcode-image';
	import { getContext } from 'svelte';
	import { nip19 } from 'nostr-tools';

	import { key } from 'src/controller';

	export let qrText: string | undefined = undefined;

	let animator = getContext('animator');

	// Derive npub from pub if needed, default to nostr:npub URI format for profile scanning
	$: derivedQrText = qrText || ($key?.pub 
		? `nostr:${$key.npub || nip19.npubEncode($key.pub)}` 
		: '');
	let copied = false;

	// Check if the qrText is an encoded URL and decode it if needed
	if (derivedQrText && derivedQrText.includes('%3A')) {
		const decoded = decodeURIComponent(derivedQrText);
		derivedQrText = decoded;
	}

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

	$: console.log('QR Text:', derivedQrText);
</script>

<div
	class="top-0 w-feed flex items-center justify-center z-10 mobile-height bg-base-300 bg-opacity-85 pt-safe"
>
	<div class="absolute left-4 top-4 cursor-pointer" on:click|stopPropagation={animator.goBack}>
		<Icon icon="mingcute:down-line" class="text-xl" />
	</div>
	<div class="flex items-center justify-center flex-col gap-6">
		<!-- Label for the QR code -->
		<div class="text-center">
			<h2 class="text-lg font-semibold">Your Profile QR</h2>
			<p class="text-sm text-base-content/60">Scan to view your profile</p>
		</div>
		<!-- QR Code with hover effect -->
		<button
			class="relative group cursor-pointer p-4 rounded-xl bg-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
			on:click={copyToClipboard}
			aria-label="Copy QR code content"
		>
			<QRCodeImage
				text={derivedQrText}
				displayType="canvas"
				displayHeight={280}
				displayWidth={280}
				margin={2}
				errorCorrectionLevel="M"
				displayClass="rounded-md"
			/>
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
		{#if derivedQrText}
			<div class="text-sm text-base-content/60 max-w-[300px] text-center break-all px-4">
				{derivedQrText.slice(0, 24)}...{derivedQrText.slice(-16)}
			</div>
		{/if}
	</div>
</div>
