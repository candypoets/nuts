<script lang="ts">
	import { resolve } from 'src/lib/paths';
	import { page } from '$app/stores';
	import {
		ArrowLeft,
		BadgeCheck,
		Check,
		Download,
		Infinity,
		Loader2,
		Printer,
		QrCode,
		Share2,
		Ticket,
		Timer,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { adminServiceBaseUrl, key, selectedAdminRelayUrl } from 'src/controller';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { QRCode } from 'svelte-qrcode-image/util';

	type InviteResponse = {
		token: string;
		expires_at: number;
		max_redemptions: number;
	};

	const expiryOptions = [
		{ label: '1 hour', seconds: 3600 },
		{ label: '1 day', seconds: 86400 },
		{ label: '7 days', seconds: 604800 },
		{ label: '30 days', seconds: 2592000 }
	];
	const badgeExpiryOptions = [
		{ label: 'Permanent', seconds: undefined },
		{ label: '30 days', seconds: 2592000 },
		{ label: '90 days', seconds: 7776000 },
		{ label: '1 year', seconds: 31536000 }
	];

	let loadedRelayUrl = '';
	let relayUrl = '';
	let relayName = '';
	let relayImage = '';
	let expiresInSeconds = 86400;
	let badgeExpiresInSeconds: number | undefined;
	let maxRedemptions = 1;
	let customPubkey = '';
	let invite: InviteResponse | undefined;
	let creating = false;
	let error = '';
	let copied = '';
	let qrDataUrl = '';
	let qrRequest = 0;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		loadCommunityRelay();
	}
	$: serviceBaseUrl = relayUrl ? adminServiceBaseUrl(relayUrl) : '';
	$: inviteEndpoint = serviceBaseUrl ? `${serviceBaseUrl}/invites` : '';
	$: redeemEndpoint = serviceBaseUrl ? `${serviceBaseUrl}/redeem` : '';
	$: inviteClaimUrl =
		invite && serviceBaseUrl
			? `${$page.url.origin}${resolve('/redeem')}?relay=${encodeURIComponent(serviceBaseUrl)}&token=${encodeURIComponent(invite.token)}`
			: '';
	$: canCreateInvite = Boolean(inviteEndpoint && $key?.pub && !creating);
	$: expiryLabel = invite ? formatDate(invite.expires_at) : '';
	$: badgeExpiryLabel = formatBadgeExpiry(badgeExpiresInSeconds);
	$: communityName = relayName || (relayUrl ? communityNameFromRelay(relayUrl) : 'this community');
	$: inviteTitle = `${communityName} invite`;
	$: inviteMessage = `${communityName} is inviting you.`;
	$: generateQr(inviteClaimUrl);

	function loadCommunityRelay() {
		relayUrl = $selectedAdminRelayUrl ? normalizeURL($selectedAdminRelayUrl) : '';
		relayName = '';
		relayImage = '';
		invite = undefined;
		error = '';
		copied = '';
		qrDataUrl = '';
		void fetchRelayInfo();
	}

	function relayInfoUrl(url: string) {
		if (url.startsWith('wss://')) return `https://${url.slice(6)}`;
		if (url.startsWith('ws://')) return `http://${url.slice(5)}`;
		return url;
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(timestamp * 1000));
	}

	function formatBadgeExpiry(seconds: number | undefined) {
		if (!seconds) return 'Permanent membership';
		const option = badgeExpiryOptions.find((candidate) => candidate.seconds === seconds);
		return option ? option.label : `${Math.floor(seconds / 86400)} days`;
	}

	function communityNameFromRelay(url: string) {
		try {
			const hostname = new URL(relayInfoUrl(url)).hostname;
			const firstLabel = hostname.split('.')[0] || hostname;
			return firstLabel
				.split(/[-_]+/)
				.filter(Boolean)
				.map((part) => part[0]?.toUpperCase() + part.slice(1))
				.join(' ');
		} catch {
			return url;
		}
	}

	async function fetchRelayInfo() {
		if (!relayUrl) return;
		try {
			const response = await fetch(relayInfoUrl(relayUrl), {
				headers: { accept: 'application/nostr+json' }
			});
			if (!response.ok) return;
			const info = await response.json();
			relayName = typeof info.name === 'string' && info.name.trim() ? info.name.trim() : '';
			relayImage = relayImageFromInfo(info);
		} catch {
			// The invite still works with the derived relay name fallback.
		}
	}

	function relayImageFromInfo(info: Record<string, unknown>) {
		for (const field of ['picture', 'image', 'icon', 'logo']) {
			const value = info[field];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
		return '';
	}

	async function createInvite() {
		if (!canCreateInvite) return;
		creating = true;
		error = '';
		copied = '';
		invite = undefined;

		const inviteRequest: {
			expires_in_seconds: number;
			max_redemptions: number;
			badge_expires_in_seconds?: number;
		} = {
			expires_in_seconds: expiresInSeconds,
			max_redemptions: Math.max(1, Math.floor(maxRedemptions || 1))
		};
		if (badgeExpiresInSeconds) inviteRequest.badge_expires_in_seconds = badgeExpiresInSeconds;

		const body = JSON.stringify(inviteRequest);

		try {
			const authorization = await makeInviteAuthorization(inviteEndpoint, body);
			const response = await fetch(inviteEndpoint, {
				method: 'POST',
				headers: {
					authorization,
					'content-type': 'application/json'
				},
				body
			});
			const data = await response.json().catch(() => undefined);
			if (!response.ok) {
				throw new Error(data?.error || data?.message || 'Could not create invite.');
			}
			invite = data as InviteResponse;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not create invite.';
		} finally {
			creating = false;
		}
	}

	async function copy(label: string, text: string) {
		if (!text) return;
		await navigator.clipboard?.writeText(text);
		copied = label;
		window.setTimeout(() => {
			if (copied === label) copied = '';
		}, 1800);
	}

	async function shareInvite() {
		if (!inviteClaimUrl) return;
		const shareData = {
			title: inviteTitle,
			text: `${inviteMessage} Scan this invite before ${expiryLabel}.`,
			url: inviteClaimUrl
		};
		if (navigator.share && navigator.canShare?.(shareData)) {
			await navigator.share(shareData);
			return;
		}
		await copy('invite', inviteClaimUrl);
	}

	async function generateQr(text: string) {
		if (!text) {
			qrDataUrl = '';
			return;
		}
		const requestId = ++qrRequest;
		const nextQrDataUrl = await QRCode.toDataURL(text, {
			errorCorrectionLevel: 'M',
			margin: 1,
			width: 720,
			color: {
				dark: '#171614',
				light: '#ffffff'
			}
		});
		if (requestId !== qrRequest) return;
		qrDataUrl = nextQrDataUrl;
	}

	function printInvite() {
		window.print();
	}

	function loadImage(src: string) {
		return new Promise<HTMLImageElement>((resolveImage, reject) => {
			const image = new Image();
			image.crossOrigin = 'anonymous';
			image.onload = () => resolveImage(image);
			image.onerror = reject;
			image.src = src;
		});
	}

	async function downloadInvitePoster() {
		if (!qrDataUrl || !invite) return;
		const canvas = document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 1600;
		const context = canvas.getContext('2d');
		if (!context) return;

		const gradient = context.createLinearGradient(0, 0, 1200, 1600);
		gradient.addColorStop(0, '#f7f1df');
		gradient.addColorStop(0.48, '#ffffff');
		gradient.addColorStop(1, '#dcefe4');
		context.fillStyle = gradient;
		context.fillRect(0, 0, 1200, 1600);

		context.fillStyle = '#173827';
		fillRoundRect(context, 86, 86, 1028, 1428, 44);

		context.fillStyle = '#fffdf6';
		fillRoundRect(context, 126, 126, 948, 1348, 34);

		if (relayImage) {
			try {
				const communityImage = await loadImage(relayImage);
				context.save();
				context.beginPath();
				context.arc(600, 260, 96, 0, Math.PI * 2);
				context.clip();
				drawCoverImage(context, communityImage, 504, 164, 192, 192);
				context.restore();

				context.strokeStyle = '#ffffff';
				context.lineWidth = 12;
				context.beginPath();
				context.arc(600, 260, 102, 0, Math.PI * 2);
				context.stroke();
			} catch {
				// Keep the poster text-only if the image cannot be loaded into canvas.
			}
		}

		context.fillStyle = '#286541';
		context.font = '800 34px sans-serif';
		context.textAlign = 'center';
		context.fillText(inviteTitle, 600, relayImage ? 440 : 230, 820);
		context.textAlign = 'left';

		context.fillStyle = '#171614';
		context.font = '900 82px sans-serif';
		wrapText(context, inviteMessage, 186, relayImage ? 575 : 375, 820, 92, 2);

		context.fillStyle = '#5f594d';
		context.font = '600 38px sans-serif';
		wrapText(
			context,
			'Scan the QR code to claim your invite and join the community.',
			186,
			relayImage ? 730 : 530,
			800,
			52,
			3
		);

		const qrImage = await loadImage(qrDataUrl);
		context.fillStyle = '#ffffff';
		fillRoundRect(context, 310, relayImage ? 845 : 710, 580, 580, 34);
		context.drawImage(qrImage, 360, relayImage ? 895 : 760, 480, 480);

		context.fillStyle = '#286541';
		context.font = '800 32px sans-serif';
		context.textAlign = 'center';
		context.fillText(`Expires ${expiryLabel}`, 600, relayImage ? 1450 : 1375);
		context.textAlign = 'left';

		const link = document.createElement('a');
		link.href = canvas.toDataURL('image/png');
		link.download = 'nuts-community-invite.png';
		link.click();
	}

	function drawCoverImage(
		context: CanvasRenderingContext2D,
		image: HTMLImageElement,
		x: number,
		y: number,
		width: number,
		height: number
	) {
		const scale = Math.max(width / image.width, height / image.height);
		const drawWidth = image.width * scale;
		const drawHeight = image.height * scale;
		context.drawImage(
			image,
			x + (width - drawWidth) / 2,
			y + (height - drawHeight) / 2,
			drawWidth,
			drawHeight
		);
	}

	function fillRoundRect(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number
	) {
		context.beginPath();
		context.moveTo(x + radius, y);
		context.lineTo(x + width - radius, y);
		context.quadraticCurveTo(x + width, y, x + width, y + radius);
		context.lineTo(x + width, y + height - radius);
		context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
		context.lineTo(x + radius, y + height);
		context.quadraticCurveTo(x, y + height, x, y + height - radius);
		context.lineTo(x, y + radius);
		context.quadraticCurveTo(x, y, x + radius, y);
		context.closePath();
		context.fill();
	}

	function wrapText(
		context: CanvasRenderingContext2D,
		text: string,
		x: number,
		y: number,
		maxWidth: number,
		lineHeight: number,
		maxLines: number
	) {
		const words = text.split(/\s+/);
		let line = '';
		let lineIndex = 0;

		for (const word of words) {
			const nextLine = line ? `${line} ${word}` : word;
			if (context.measureText(nextLine).width > maxWidth && line) {
				if (lineIndex >= maxLines - 1) {
					// Last allowed line is full: trim until the ellipsis fits, then stop.
					while (line && context.measureText(`${line}…`).width > maxWidth) {
						line = line.split(/\s+/).slice(0, -1).join(' ');
					}
					context.fillText(`${line}…`, x, y);
					return;
				}
				context.fillText(line, x, y);
				line = word;
				y += lineHeight;
				lineIndex += 1;
			} else {
				line = nextLine;
			}
		}

		if (line) context.fillText(line, x, y);
	}
</script>

<svelte:head>
	<title>Invites - Nuts</title>
</svelte:head>

<main class="px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto grid max-w-[1500px] gap-6">
		<a
			href={resolve('/admin')}
			class="inline-flex w-fit items-center gap-2 rounded-lg text-sm font-bold text-stone-600 transition hover:text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
		>
			<ArrowLeft size={17} />
			Dashboard
		</a>

		<section
			class="overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm shadow-stone-950/5"
		>
			<div class="grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_420px]">
				<div>
					<p class="text-sm font-black text-emerald-900">Invites</p>
					<h1 class="mt-3 text-3xl font-black text-[#171614]">Create invite</h1>
					<p class="mt-3 max-w-2xl text-lg font-medium leading-8 text-stone-600">
						Generate a claim token for new members. Anyone with the token can use it until it
						expires or reaches its use limit.
					</p>
					<p class="mt-4 truncate text-sm font-bold text-stone-500">{relayUrl}</p>
				</div>

				<div class="rounded-2xl bg-[#111f19] p-6 text-white">
					<div class="grid h-12 w-12 place-items-center rounded-xl bg-emerald-800">
						<Ticket size={24} />
					</div>
					<p class="mt-5 text-2xl font-black">Invite service</p>
					<p class="mt-2 text-sm font-medium leading-6 text-white/70">
						Invites are created at this community relay and redeemed by members when they join.
					</p>
				</div>
			</div>
		</section>

		<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
			<section
				class="rounded-2xl border border-stone-200 bg-white/85 p-6 shadow-sm shadow-stone-950/5 lg:p-8"
			>
				<div class="grid gap-7">
					<div>
						<label class="text-sm font-black text-stone-700" for="expires">Expires after</label>
						<div id="expires" class="mt-3 grid gap-2 sm:grid-cols-4">
							{#each expiryOptions as option (option.seconds)}
								<button
									type="button"
									class={`h-11 rounded-xl border px-3 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] ${
										expiresInSeconds === option.seconds
											? 'border-emerald-950 bg-emerald-950 text-white'
											: 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
									}`}
									on:click={() => (expiresInSeconds = option.seconds)}
								>
									{option.label}
								</button>
							{/each}
						</div>
					</div>

					<div>
						<label class="text-sm font-black text-stone-700" for="badge-expires">
							Membership lasts
						</label>
						<div id="badge-expires" class="mt-3 grid gap-2 sm:grid-cols-4">
							{#each badgeExpiryOptions as option (option.label)}
								<button
									type="button"
									class={`h-11 rounded-xl border px-3 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] ${
										badgeExpiresInSeconds === option.seconds
											? 'border-emerald-950 bg-emerald-950 text-white'
											: 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
									}`}
									on:click={() => (badgeExpiresInSeconds = option.seconds)}
								>
									{option.label}
								</button>
							{/each}
						</div>
						<p class="mt-2 text-sm font-semibold leading-6 text-stone-500">
							Controls when the redeemed member badge expires. Permanent badges remain valid until
							removed.
						</p>
					</div>

					<div class="grid gap-5 md:grid-cols-2">
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Maximum uses</span>
							<input
								class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
								type="number"
								min="1"
								step="1"
								bind:value={maxRedemptions}
							/>
						</label>
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Specific member</span>
							<input
								class="h-12 rounded-xl border border-stone-200 bg-stone-50 px-4 text-base font-bold text-stone-400 outline-none"
								type="text"
								placeholder="Not available yet"
								bind:value={customPubkey}
								disabled
							/>
						</label>
					</div>

					<div
						class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900"
					>
						Member-specific invites are not enabled by the invite service yet. For now, keep
						single-person invites at one use.
					</div>

					{#if error}
						<p class="rounded-xl border border-rose-200 bg-rose-50 p-4 font-bold text-rose-800">
							{error}
						</p>
					{/if}

					<button
						type="button"
						class="inline-flex h-12 w-fit items-center gap-3 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!canCreateInvite}
						on:click={createInvite}
					>
						{#if creating}
							<Loader2 size={18} class="animate-spin" />
							Creating
						{:else}
							<Ticket size={18} />
							Create invite
						{/if}
					</button>
				</div>
			</section>

			<aside class="grid content-start gap-6">
				<section
					class="rounded-2xl border border-stone-200 bg-white/85 p-6 shadow-sm shadow-stone-950/5"
				>
					<h2 class="text-xl font-black text-[#171614]">Invite details</h2>
					<div class="mt-5 grid gap-3">
						<div class="flex items-center gap-3 rounded-xl bg-stone-50 p-4">
							<Timer size={20} class="text-emerald-900" />
							<span class="min-w-0">
								<span class="block text-sm font-black text-stone-700">Expiry</span>
								<span class="block truncate text-sm font-semibold text-stone-500">
									{invite ? expiryLabel : 'Choose a duration'}
								</span>
							</span>
						</div>
						<div class="flex items-center gap-3 rounded-xl bg-stone-50 p-4">
							{#if badgeExpiresInSeconds}
								<BadgeCheck size={20} class="text-emerald-900" />
							{:else}
								<Infinity size={20} class="text-emerald-900" />
							{/if}
							<span class="min-w-0">
								<span class="block text-sm font-black text-stone-700">Membership</span>
								<span class="block truncate text-sm font-semibold text-stone-500">
									{badgeExpiryLabel}
								</span>
							</span>
						</div>
						<div class="flex items-center gap-3 rounded-xl bg-stone-50 p-4">
							<UsersRound size={20} class="text-emerald-900" />
							<span>
								<span class="block text-sm font-black text-stone-700">Uses</span>
								<span class="block text-sm font-semibold text-stone-500">
									{invite ? invite.max_redemptions : maxRedemptions}
								</span>
							</span>
						</div>
					</div>
				</section>

				{#if invite}
					<section
						class="print-invite rounded-2xl border border-stone-200 bg-white/85 p-6 shadow-sm shadow-stone-950/5"
					>
						<div class="flex items-start justify-between gap-4">
							<div>
								<h2 class="text-xl font-black text-[#171614]">Invite ready</h2>
								<p class="mt-1 text-sm font-medium text-stone-500">
									Share the QR code or print the invite. The token stays hidden.
								</p>
							</div>
							<span
								class="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2 text-xs font-black text-emerald-900"
							>
								<Check size={14} />
								Ready
							</span>
						</div>

						<div class="mt-5 overflow-hidden rounded-2xl border border-emerald-950/10 bg-[#fffdf6]">
							<div class="bg-[#173827] px-6 py-5 text-white">
								{#if relayImage}
									<img
										class="mb-4 h-20 w-20 rounded-full border-4 border-white/20 object-cover shadow-lg shadow-black/20"
										src={relayImage}
										alt={`${communityName} community`}
									/>
								{/if}
								<p class="text-sm font-black uppercase tracking-normal text-emerald-100">
									{inviteTitle}
								</p>
								<h3 class="mt-3 text-3xl font-black leading-none">{inviteMessage}</h3>
								<p class="mt-3 text-sm font-semibold leading-6 text-white/75">
									Scan this QR code to claim your invite and join the community.
								</p>
							</div>

							<div class="grid gap-5 p-6">
								<div
									class="mx-auto grid h-56 w-56 place-items-center rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
								>
									{#if qrDataUrl}
										<img
											class="h-full w-full object-contain"
											src={qrDataUrl}
											alt="Invite QR code"
										/>
									{:else}
										<span class="text-xs font-bold text-stone-500">Generating QR</span>
									{/if}
								</div>

								<div class="grid gap-3">
									<div class="rounded-xl bg-stone-50 p-4">
										<p class="text-xs font-black uppercase text-stone-500">Expires</p>
										<p class="mt-1 text-sm font-black text-[#171614]">{expiryLabel}</p>
									</div>
								</div>

								<p class="text-center text-xs font-semibold leading-5 text-stone-500">
									Open your camera, scan the code, and follow the join screen.
								</p>
							</div>
						</div>

						<div class="no-print mt-4 grid gap-2">
							<button
								type="button"
								class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
								on:click={shareInvite}
							>
								<Share2 size={16} />
								{copied === 'invite' ? 'Copied link' : 'Share online'}
							</button>
							<button
								type="button"
								class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
								on:click={printInvite}
							>
								<Printer size={16} />
								Print / save PDF
							</button>
							<button
								type="button"
								class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
								on:click={downloadInvitePoster}
							>
								<Download size={16} />
								Download image
							</button>
							<button
								type="button"
								class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
								on:click={() => copy('claim', inviteClaimUrl)}
							>
								<QrCode size={16} />
								{copied === 'claim' ? 'Copied' : 'Copy invite link'}
							</button>
						</div>
					</section>
				{/if}
			</aside>
		</div>
	</div>
</main>

<style>
	@media print {
		:global(body *) {
			visibility: hidden;
		}

		.print-invite,
		.print-invite * {
			visibility: visible;
		}

		.print-invite {
			position: absolute;
			left: 0;
			top: 0;
			width: 100%;
			border: 0;
			box-shadow: none;
		}

		.no-print {
			display: none;
		}
	}
</style>
