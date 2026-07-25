<script lang="ts">
	import type { ParsedEvent, RequestObject, WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isEoce, isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		BadgeCheck,
		CircleAlert,
		Code2,
		CreditCard,
		ExternalLink,
		Plus,
		Sparkles,
		X
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import type { EventTemplate } from 'nostr-tools';
	import imageCompression from 'browser-image-compression';
	import { key, selectedAdminRelayUrl } from 'src/controller';
	import { BADGE_DEFINITION_TYPE_TOPICS } from 'src/lib/catalog';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { parsedEventTags } from 'src/lib/adminRelays';
	import {
		buildMembershipDefinitionTags,
		membershipDFromName,
		parseMembershipDefinition,
		type MembershipDefinition
	} from 'src/lib/memberships';
	import { now } from 'src/lib/period';
	import { DEFAULT_SERVER, getUserUploadConfig, uploadFile } from 'src/lib/upload';
	import { onDestroy } from 'svelte';

	export let onOpenPayments: () => void = () => {};

	let memberships: MembershipDefinition[] = [];
	let relayUrl = '';
	let loadedRelayUrl = '';
	let loading = true;
	let paymentConnected = false;
	let stripeAccountId = '';
	let paymentChecked = false;
	let paymentStatusError = '';
	let showModal = false;
	let publishing = false;
	let errorMessage = '';
	let name = '';
	let description = '';
	let image = '';
	let imagePreview = '';
	let imageUploadStatus = '';
	let imageUploadState: 'idle' | 'preparing' | 'uploading' | 'success' | 'error' = 'idle';
	let imageUploading = false;
	let price = '';
	let currency = 'EUR';
	let billing: MembershipDefinition['billing'] = 'monthly';
	let unsubscribeDefinitions: (() => void) | undefined;
	let unsubscribePublish: (() => void) | undefined;
	let embedCopied = false;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		relayUrl = loadedRelayUrl ? normalizeURL(loadedRelayUrl) : '';
		subscribeMemberships();
		checkPaymentProvider();
	}
	$: canCreate = Boolean(
		name.trim().length > 1 &&
		Number(price) > 0 &&
		currency.length === 3 &&
		!memberships.some(
			(membership) => membership.name.toLowerCase() === name.trim().toLowerCase()
		) &&
		Boolean(stripeAccountId) &&
		!imageUploading
	);

	function formatPrice(membership: MembershipDefinition) {
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: membership.currency
			}).format(Number(membership.price));
		} catch {
			return `${membership.price} ${membership.currency}`;
		}
	}

	function billingLabel(value: MembershipDefinition['billing']) {
		if (value === 'monthly') return 'per month';
		if (value === 'yearly') return 'per year';
		return 'one-time';
	}

	function membershipGradient(name: string) {
		let hash = 0;
		for (let index = 0; index < name.length; index += 1) {
			hash = name.charCodeAt(index) + ((hash << 5) - hash);
		}
		const firstHue = Math.abs(hash) % 360;
		const secondHue = (firstHue + 55 + (Math.abs(hash) % 70)) % 360;
		return `linear-gradient(135deg, hsl(${firstHue} 72% 72%), hsl(${secondHue} 78% 88%))`;
	}

	function selectBilling(value: string) {
		if (value === 'monthly' || value === 'yearly' || value === 'one_time') billing = value;
	}

	async function uploadMembershipImage(event: Event) {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement)) return;
		const file = input.files?.[0];
		if (!file) return;
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		imagePreview = URL.createObjectURL(file);
		image = '';
		imageUploadStatus = 'Preparing image for upload…';
		imageUploadState = 'preparing';
		imageUploading = true;
		const uploadConfig = getUserUploadConfig();
		const uploadType = uploadConfig?.type || 'blossom';
		const uploadServer = uploadConfig?.servers[0] || DEFAULT_SERVER;
		console.info('[membership-image-upload] selected file', {
			name: file.name,
			type: file.type,
			size: file.size,
			uploadType,
			uploadServer
		});
		try {
			let prepared = file;
			if (file.type.startsWith('image/')) {
				prepared = await imageCompression(file, {
					maxSizeMB: 0.8,
					maxWidthOrHeight: 1400,
					useWebWorker: true,
					fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
					initialQuality: 0.84
				});
			}
			imageUploadStatus = `Uploading to ${uploadType === 'blossom' ? 'Blossom' : 'NIP-96'} at ${uploadServer}…`;
			imageUploadState = 'uploading';
			console.info('[membership-image-upload] starting upload', {
				originalBytes: file.size,
				uploadBytes: prepared.size,
				type: prepared.type,
				uploadType,
				uploadServer
			});
			const result = await uploadFile(prepared, {
				preferUserServers: true,
				alt: name.trim() || prepared.name || file.name,
				includeMimeTag: true,
				includeDimensions: true
			});
			image = result.url;
			imageUploadStatus = 'Uploaded successfully';
			imageUploadState = 'success';
			console.info('[membership-image-upload] upload complete', {
				url: result.url,
				sha256: result.sha256
			});
			URL.revokeObjectURL(imagePreview);
			imagePreview = '';
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Image upload failed';
			imageUploadStatus = message;
			imageUploadState = 'error';
			console.error('[membership-image-upload] upload failed', error);
		} finally {
			imageUploading = false;
			input.value = '';
		}
	}

	async function checkPaymentProvider() {
		paymentChecked = false;
		paymentConnected = false;
		stripeAccountId = '';
		paymentStatusError = '';
		if (!relayUrl) return;
		try {
			const body = JSON.stringify({ action: 'status', community: relayUrl });
			const url = new URL('/api/stripe/connect', window.location.origin).toString();
			const authorization = await makeInviteAuthorization(url, body, $key?.pub);
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization },
				body
			});
			const status = await response.json();
			if (!response.ok) {
				throw new Error(status.message || status.error || 'Could not check payment connection');
			}
			paymentConnected = Boolean(response.ok && status.connected);
			stripeAccountId = paymentConnected ? status.accountId || '' : '';
		} catch (error) {
			paymentConnected = false;
			paymentStatusError =
				error instanceof Error ? error.message : 'Could not check payment connection';
		} finally {
			paymentChecked = true;
		}
	}

	function subscribeMemberships() {
		unsubscribeDefinitions?.();
		memberships = [];
		loading = Boolean(relayUrl);
		if (!relayUrl) {
			loading = false;
			return;
		}
		const requests: RequestObject[] = [
			{
				kinds: [30009],
				tags: { '#t': [BADGE_DEFINITION_TYPE_TOPICS.membership] },
				limit: 20,
				relays: [relayUrl],
				cacheFirst: true
			},
			{
				kinds: [5],
				limit: 20,
				relays: [relayUrl],
				cacheFirst: true
			}
		];
		unsubscribeDefinitions = useSubscription(
			'admin_memberships_classified_v1_' + relayUrl,
			requests,
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (!event) {
					const status = isConnectionStatus(message);
					const eose = isEoce(message);
					console.info('[membership-subscription:admin] worker message', {
						relay: status?.relayUrl()?.toString() || message.url()?.toString(),
						status: status?.status()?.toString(),
						statusMessage: status?.message()?.toString(),
						eose: Boolean(eose),
						subscriptionId: eose?.subscriptionId()?.toString(),
						messageType: message.type(),
						contentType: message.contentType()
					});
					return;
				}
				console.info('[membership-subscription:admin] parsed event', {
					relay: message.url()?.toString(),
					id: event.id()?.toString(),
					kind: event.kind(),
					pubkey: event.pubkey()?.toString(),
					createdAt: Number(event.createdAt()),
					acceptedAsMembership: Boolean(parseMembershipDefinition(event))
				});
				if (event.kind() === 5) {
					applyMembershipDeletion(event);
					return;
				}
				upsertMembership(event);
			},
			{ bytesPerEvent: 10 * 1024 }
		);
		window.setTimeout(() => (loading = false), 1600);
	}

	function applyMembershipDeletion(event: ParsedEvent) {
		const author = event.pubkey();
		if (!author) return;
		const deletedAddresses = parsedEventTags(event)
			.filter((tag) => tag[0] === 'a')
			.map((tag) => tag[1])
			.filter((address): address is string => Boolean(address));
		if (!deletedAddresses.length) return;
		const remaining = memberships.filter(
			(membership) => membership.pubkey !== author || !deletedAddresses.includes(membership.address)
		);
		if (remaining.length !== memberships.length) memberships = remaining;
	}

	function upsertMembership(event: ParsedEvent) {
		const membership = parseMembershipDefinition(event);
		if (!membership) return;
		const index = memberships.findIndex((item) => item.address === membership.address);
		if (index !== -1) {
			if (membership.createdAt <= memberships[index].createdAt) return;
			memberships = memberships.map((item, itemIndex) => (itemIndex === index ? membership : item));
		} else {
			memberships = [...memberships, membership].sort((a, b) => a.name.localeCompare(b.name));
		}
		loading = false;
	}

	function openModal() {
		if (!paymentConnected) {
			onOpenPayments();
			return;
		}
		errorMessage = '';
		showModal = true;
	}

	function storefrontPath() {
		if (!relayUrl) return '';
		try {
			return `/memberships/${encodeURIComponent(new URL(relayUrl).host)}`;
		} catch {
			return '';
		}
	}

	function openStorefront() {
		const path = storefrontPath();
		if (path) window.open(path, '_blank', 'noopener,noreferrer');
	}

	async function copyEmbedCode() {
		const path = storefrontPath();
		if (!path) return;
		const src = new URL(path, window.location.origin);
		src.searchParams.set('embed', '1');
		await navigator.clipboard.writeText(
			`<iframe src="${src}" title="${relayUrl} memberships" style="width:100%;min-height:720px;border:0;border-radius:20px" loading="lazy" allow="payment"></iframe>`
		);
		embedCopied = true;
		window.setTimeout(() => (embedCopied = false), 1800);
	}

	function closeModal() {
		if (publishing) return;
		showModal = false;
	}

	function createMembership() {
		const pubkey = $key?.pub;
		const d = membershipDFromName(name);
		if (!canCreate || !relayUrl || !pubkey || !d) return;
		const createdAt = now();
		const cleanName = name.trim();
		const cleanDescription = description.trim() || `Access included with ${cleanName}.`;
		const cleanPrice = String(Number(price));
		const event: EventTemplate = {
			kind: 30009,
			content: cleanDescription,
			created_at: createdAt,
			tags: [
				...buildMembershipDefinitionTags({
					d,
					name: cleanName,
					description: cleanDescription,
					image,
					price: cleanPrice,
					currency,
					billing,
					stripeAccountId
				}),
				['r', relayUrl]
			]
		};
		publishing = true;
		unsubscribePublish?.();
		console.info('[membership-publish] publishing membership definition', {
			kind: event.kind,
			d,
			relays: [relayUrl]
		});
		unsubscribePublish = usePublish(
			'admin_membership_' + relayUrl + '_' + d,
			event,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				const statusRelay = status?.relayUrl()?.toString() || message.url()?.toString() || '';
				console.info('[membership-publish] relay status', {
					d,
					relay: statusRelay || relayUrl,
					status: status?.status()?.toString(),
					message: status?.message()?.toString()
				});
				if (statusRelay && normalizeURL(statusRelay) !== relayUrl) {
					console.error('[membership-publish] unexpected relay destination', {
						expected: relayUrl,
						actual: statusRelay
					});
				}
				publishing = false;
			},
			{ trackStatus: true, defaultRelays: [relayUrl] }
		);
		memberships = [
			...memberships,
			{
				address: `30009:${pubkey}:${d}`,
				pubkey,
				d,
				name: cleanName,
				description: cleanDescription,
				image,
				price: cleanPrice,
				currency,
				billing,
				stripeAccountId,
				createdAt
			}
		].sort((a, b) => a.name.localeCompare(b.name));
		name = '';
		description = '';
		image = '';
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		imagePreview = '';
		imageUploadStatus = '';
		imageUploadState = 'idle';
		price = '';
		currency = 'EUR';
		billing = 'monthly';
		publishing = false;
		showModal = false;
	}

	onDestroy(() => {
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		unsubscribeDefinitions?.();
		unsubscribePublish?.();
	});
</script>

<section>
	<div
		class="flex flex-col gap-4 border-b border-stone-200 pb-7 sm:flex-row sm:items-end sm:justify-between"
	>
		<div>
			<p class="text-sm font-black uppercase tracking-[0.15em] text-emerald-800">Access plans</p>
			<h1 class="mt-2 text-4xl font-black tracking-tight text-stone-950">Memberships</h1>
			<p class="mt-3 max-w-2xl font-semibold leading-7 text-stone-500">
				Create paid plans that automatically grant members a community badge.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50"
				disabled={!relayUrl}
				on:click={openStorefront}><ExternalLink size={17} /> View store</button
			><button
				type="button"
				class="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50"
				disabled={!relayUrl}
				on:click={copyEmbedCode}><Code2 size={17} /> {embedCopied ? 'Copied!' : 'Embed'}</button
			><button
				type="button"
				class="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#073c32] px-5 text-sm font-black text-white transition hover:bg-[#0a4b3e] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
				disabled={!paymentChecked}
				on:click={openModal}><Plus size={18} /> New membership</button
			>
		</div>
	</div>

	{#if !paymentChecked || loading}
		<div class="mt-8 grid gap-4 sm:grid-cols-2">
			<div class="h-40 animate-pulse rounded-2xl bg-stone-100"></div>
			<div class="h-40 animate-pulse rounded-2xl bg-stone-100"></div>
		</div>
	{:else if paymentStatusError}
		<div
			class="mt-8 rounded-2xl border border-red-200 bg-red-50 p-8 sm:flex sm:items-center sm:justify-between sm:gap-8"
		>
			<div class="flex items-start gap-4">
				<span
					class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-red-700 shadow-sm"
					><CircleAlert size={23} /></span
				>
				<div>
					<h2 class="text-xl font-black text-stone-950">Could not verify payments</h2>
					<p class="mt-2 max-w-xl text-sm font-semibold leading-6 text-stone-600">
						{paymentStatusError}
					</p>
				</div>
			</div>
			<button
				type="button"
				class="mt-5 inline-flex h-11 shrink-0 items-center rounded-lg bg-stone-950 px-5 text-sm font-black text-white sm:mt-0"
				on:click={checkPaymentProvider}>Try again</button
			>
		</div>
	{:else if !paymentConnected}
		<div
			class="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-8 sm:flex sm:items-center sm:justify-between sm:gap-8"
		>
			<div class="flex items-start gap-4">
				<span
					class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-amber-700 shadow-sm"
					><CreditCard size={23} /></span
				>
				<div>
					<h2 class="text-xl font-black text-stone-950">Connect payments first</h2>
					<p class="mt-2 max-w-xl text-sm font-semibold leading-6 text-stone-600">
						A payment provider is required before you can create and sell a membership.
					</p>
				</div>
			</div>
			<button
				type="button"
				class="mt-5 inline-flex h-11 shrink-0 items-center rounded-lg bg-stone-950 px-5 text-sm font-black text-white sm:mt-0"
				on:click={onOpenPayments}>Set up payments</button
			>
		</div>
	{:else if memberships.length === 0}
		<div
			class="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center"
		>
			<span
				class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-800"
				><Sparkles size={25} /></span
			>
			<h2 class="mt-5 text-2xl font-black">Create your first membership</h2>
			<p class="mx-auto mt-2 max-w-md font-semibold leading-6 text-stone-500">
				Offer recurring membership or a one-time supporter plan. Members receive access
				automatically after payment.
			</p>
			<button
				type="button"
				class="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-[#073c32] px-5 text-sm font-black text-white"
				on:click={openModal}><Plus size={18} /> New membership</button
			>
		</div>
	{:else}
		<div class="mt-8 grid gap-4 lg:grid-cols-2">
			{#each memberships as membership (membership.address)}<article
					class="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
				>
					<div
						class="relative h-40 overflow-hidden"
						style:background={membership.image ? undefined : membershipGradient(membership.name)}
					>
						{#if membership.image}<img
								src={membership.image}
								alt={`${membership.name} membership cover`}
								class="h-full w-full object-cover"
							/>{:else}<div
								class="flex h-full items-end bg-gradient-to-t from-black/20 to-transparent p-5"
							>
								<span
									class="rounded-full border border-white/50 bg-white/25 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm backdrop-blur"
									>{membership.name}</span
								>
							</div>{/if}
					</div>
					<div class="p-6">
						<div class="flex items-start justify-between gap-5">
							<span
								class="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800"
								><BadgeCheck size={22} /></span
							>
							<span class="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-600"
								>{billingLabel(membership.billing)}</span
							>
						</div>
						<h2 class="mt-5 text-xl font-black">{membership.name}</h2>
						<p class="mt-2 min-h-10 text-sm font-semibold leading-5 text-stone-500">
							{membership.description}
						</p>
						<div class="mt-5 border-t border-stone-100 pt-5">
							<span class="text-2xl font-black">{formatPrice(membership)}</span>
							<span class="text-sm font-bold text-stone-400"
								>{billingLabel(membership.billing)}</span
							>
						</div>
					</div>
				</article>{/each}
		</div>
	{/if}
</section>

{#if showModal}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 p-4 backdrop-blur-sm"
		role="presentation"
		on:click|self={closeModal}
	>
		<div
			class="max-h-[92vh] w-full max-w-xl overflow-auto rounded-2xl bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="membership-title"
		>
			<header class="flex items-start justify-between border-b border-stone-200 p-6">
				<div>
					<p class="text-sm font-black uppercase tracking-wide text-emerald-800">New plan</p>
					<h2 id="membership-title" class="mt-1 text-2xl font-black">Create membership</h2>
				</div>
				<button
					type="button"
					class="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"
					aria-label="Close"
					on:click={closeModal}><X size={20} /></button
				>
			</header>
			<div class="space-y-5 p-6">
				{#if errorMessage}<p
						class="flex gap-2 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700"
					>
						<CircleAlert size={18} />{errorMessage}
					</p>{/if}
				<label class="block"
					><span class="mb-2 block text-sm font-black">Membership name</span><input
						bind:value={name}
						placeholder="Community Member"
						class="h-12 w-full rounded-lg border border-stone-300 px-3 font-semibold outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
					/></label
				>
				<label class="block"
					><span class="mb-2 block text-sm font-black">Description</span><textarea
						bind:value={description}
						rows="3"
						placeholder="What members receive…"
						class="w-full rounded-lg border border-stone-300 p-3 font-semibold outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
					></textarea></label
				>
				<div>
					<span class="mb-2 block text-sm font-black"
						>Cover image <span class="font-semibold text-stone-400">· optional</span></span
					>
					<div
						class="flex items-center gap-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3"
					>
						{#if image || imagePreview}<div class="relative h-20 w-28 shrink-0">
								<img
									src={image || imagePreview}
									alt="Membership cover preview"
									class="h-20 w-28 rounded-lg object-cover"
								/>
								{#if imagePreview}<span
										class="absolute inset-x-1 bottom-1 rounded bg-stone-950/75 px-1.5 py-0.5 text-center text-[9px] font-black uppercase tracking-wide text-white"
										>Local preview</span
									>{/if}
							</div>{:else}<div
								class="grid h-20 w-28 place-items-center rounded-lg bg-gradient-to-br from-emerald-200 via-amber-100 to-orange-200 text-xs font-black text-emerald-900"
							>
								Auto gradient
							</div>{/if}
						<div class="min-w-0 flex-1">
							<label
								class={`inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-black shadow-sm ${imageUploading ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-stone-50'}`}
								><input
									type="file"
									accept="image/*"
									class="sr-only"
									disabled={imageUploading}
									on:change={uploadMembershipImage}
								/>{imageUploading
									? 'Uploading…'
									: image || imagePreview
										? 'Replace image'
										: 'Upload image'}</label
							>{#if image || imagePreview}<button
									type="button"
									class="ml-2 text-xs font-black text-stone-500 hover:text-red-600"
									disabled={imageUploading}
									on:click={() => {
										image = '';
										if (imagePreview) URL.revokeObjectURL(imagePreview);
										imagePreview = '';
										imageUploadStatus = '';
										imageUploadState = 'idle';
									}}>Remove</button
								>{/if}
							{#if imageUploadState !== 'idle'}<div
									class={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${imageUploadState === 'error' ? 'border-red-200 bg-red-50 text-red-700' : imageUploadState === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
									role="status"
								>
									<p class="flex items-center gap-2">
										{#if imageUploadState === 'success'}<BadgeCheck
												size={15}
											/>{:else if imageUploadState === 'error'}<CircleAlert size={15} />{:else}<span
												class="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
											></span>{/if}{imageUploadStatus}
									</p>
									{#if imageUploadState === 'success'}<p
											class="mt-1 break-all font-mono text-[10px] font-semibold text-emerald-700"
										>
											{image}
										</p>{/if}
								</div>{:else}<p class="mt-2 text-xs font-bold text-stone-400">
									A name-derived gradient is used when empty.
								</p>{/if}
						</div>
					</div>
				</div>
				<fieldset>
					<legend class="mb-2 text-sm font-black">Billing</legend>
					<div class="grid grid-cols-3 gap-2">
						{#each [{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'one_time', label: 'One-time' }] as option (option.value)}<button
								type="button"
								class={`h-11 rounded-lg border text-sm font-black ${billing === option.value ? 'border-emerald-800 bg-emerald-50 text-emerald-900' : 'border-stone-200 text-stone-600'}`}
								on:click={() => selectBilling(option.value)}>{option.label}</button
							>{/each}
					</div>
				</fieldset>
				<div class="grid grid-cols-[1fr_120px] gap-3">
					<label
						><span class="mb-2 block text-sm font-black">Price</span><input
							bind:value={price}
							type="number"
							min="0.01"
							step="0.01"
							placeholder="15.00"
							class="h-12 w-full rounded-lg border border-stone-300 px-3 font-semibold outline-none focus:border-emerald-700"
						/></label
					><label
						><span class="mb-2 block text-sm font-black">Currency</span><select
							bind:value={currency}
							class="h-12 w-full rounded-lg border border-stone-300 bg-white px-3 font-black outline-none"
							><option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option
							></select
						></label
					>
				</div>
			</div>
			<footer class="flex justify-end gap-3 border-t border-stone-200 p-6">
				<p class="mr-auto min-w-0 self-center text-xs font-bold text-stone-500">
					Publishing only to <span class="break-all text-stone-700">{relayUrl}</span>
				</p>
				<button
					type="button"
					class="h-11 rounded-lg px-5 text-sm font-black text-stone-600 hover:bg-stone-100"
					on:click={closeModal}>Cancel</button
				><button
					type="button"
					class="h-11 rounded-lg bg-[#073c32] px-5 text-sm font-black text-white disabled:bg-stone-200 disabled:text-stone-500"
					disabled={!canCreate || publishing}
					on:click={createMembership}>{publishing ? 'Creating…' : 'Create membership'}</button
				>
			</footer>
		</div>
	</div>
{/if}
