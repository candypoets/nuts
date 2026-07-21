<script lang="ts">
	import { Html5Qrcode, type QrcodeErrorCallback, type QrcodeSuccessCallback } from 'html5-qrcode';
	import { isLightningInvoice, isNostr, isNpub, isValidLNURL } from 'src/lib/wallet';
	import { nip19, type EventTemplate } from 'nostr-tools';
	import { getContext, onDestroy, onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import { type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isParsedEvent } from '@candypoets/nipworker/utils';
	import { key } from 'src/controller';
	import { parsedEventTags } from 'src/lib/adminRelays';
	import {
		decodeCheckInContext,
		decodePresentation,
		verifyPresentation
	} from 'src/lib/presentation';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';

	// Import components for inline display
	import Melt from './melt.svelte';
	import Kind0 from '../_kinds/kind0.svelte';

	let animator = getContext('animator');

	export let context = '';

	const checkInContext = decodeCheckInContext(context);

	// State for what to show
	let view: 'scan' | 'melt' | 'profile' | 'verification' = 'scan';
	let scannedInvoice = '';
	let scannedPubkey = '';
	let verificationState: 'checking' | 'admitted' | 'rejected' = 'checking';
	let verificationMessage = '';
	let verificationSubscriptions: (() => void)[] = [];
	let consumptionPublish: (() => void) | undefined;
	let verificationTimeout: ReturnType<typeof setTimeout> | undefined;
	let readerElement: HTMLDivElement;
	let startTimer: ReturnType<typeof setTimeout> | undefined;
	let mounted = false;

	type BadgeDefinition = { address: string; maxUses?: number };
	type BadgeAward = {
		id: string;
		address: string;
		issuer: string;
		expiresAt?: number;
	};
	type Consumption = { awardId: string; eventAddress: string; signer: string };

	// For Kind0 component
	let visible = true;

	function clearVerificationWork() {
		for (const unsubscribe of verificationSubscriptions) unsubscribe();
		verificationSubscriptions = [];
		consumptionPublish?.();
		consumptionPublish = undefined;
		if (verificationTimeout) clearTimeout(verificationTimeout);
		verificationTimeout = undefined;
	}

	function goBackToScan() {
		view = 'scan';
		scannedInvoice = '';
		scannedPubkey = '';
		verificationState = 'checking';
		verificationMessage = '';
		clearVerificationWork();
		// Restart scanning
		startTimer = setTimeout(start, 100);
	}

	function finishVerification(admitted: boolean, message: string) {
		clearVerificationWork();
		verificationState = admitted ? 'admitted' : 'rejected';
		verificationMessage = message;
	}

	function verifyCheckIn(decodedText: string) {
		if (!checkInContext) return false;
		const presentation = decodePresentation(decodedText);
		if (!presentation) return false;
		stop();
		view = 'verification';
		scannedPubkey = presentation.pubkey;
		verificationState = 'checking';
		verificationMessage = 'Verifying signed identity…';
		if (!verifyPresentation(presentation)) {
			finishVerification(false, 'This identity presentation is invalid or has expired.');
			return true;
		}
		if (!checkInContext.badgeAddresses.length) {
			finishVerification(true, 'Identity verified for this open event.');
			return true;
		}
		const eventAuthority = checkInContext.eventAddress.split(':')[1];
		if (!$key?.pub || $key.pub !== eventAuthority) {
			finishVerification(false, 'The active signer is not the authority for this event.');
			return true;
		}

		verificationMessage = 'Resolving accepted badge definitions…';
		const definitions = new Map<string, BadgeDefinition>();
		const awards = new Map<string, BadgeAward>();
		const definitionRequests: RequestObject[] = checkInContext.badgeAddresses.flatMap((address) => {
			const [kind, author, ...dParts] = address.split(':');
			const d = dParts.join(':');
			return kind === '30009' && author && d
				? [{ kinds: [30009], authors: [author], tags: { '#d': [d] }, limit: 1, relays: [checkInContext.community], cacheFirst: true }]
				: [];
		});
		const discoveryRequests: RequestObject[] = [
			...definitionRequests,
			{
				kinds: [8],
				tags: { '#p': [presentation.pubkey], '#a': checkInContext.badgeAddresses },
				limit: 100,
				relays: [checkInContext.community],
				cacheFirst: true
			}
		];
		verificationSubscriptions.push(useSubscription(
			`event_checkin_discovery_${presentation.id}`,
			discoveryRequests,
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (!event) return;
				const tags = parsedEventTags(event);
				if (event.kind() === 30009) {
					const issuer = event.pubkey();
					const d = tags.find((tag) => tag[0] === 'd')?.[1];
					if (!issuer || !d) return;
					const address = `30009:${issuer}:${d}`;
					if (!checkInContext.badgeAddresses.includes(address)) return;
					const maxUsesValue = Number(tags.find((tag) => tag[0] === 'max_uses')?.[1] || 0);
					const isEventPass = tags.find((tag) => tag[0] === 'type')?.[1] === 'event_access';
					definitions.set(address, {
						address,
						maxUses: Number.isSafeInteger(maxUsesValue) && maxUsesValue > 0
							? maxUsesValue
							: isEventPass ? 1 : undefined
					});
					return;
				}
				if (event.kind() !== 8) return;
				const address = tags.find((tag) => tag[0] === 'a')?.[1];
				const recipient = tags.find((tag) => tag[0] === 'p')?.[1];
				const issuer = event.pubkey();
				const id = event.id();
				const expiration = Number(tags.find((tag) => tag[0] === 'expiration')?.[1] || 0);
				if (!address || !issuer || !id || recipient !== presentation.pubkey) return;
				if (!checkInContext.badgeAddresses.includes(address) || address.split(':')[1] !== issuer) return;
				if (expiration && expiration <= Math.floor(Date.now() / 1000)) return;
				awards.set(id, {
					id,
					address,
					issuer,
					expiresAt: expiration || undefined
				});
			},
			{ bytesPerEvent: 10 * 1024 }
		));

		verificationTimeout = setTimeout(() => {
			if (!awards.size) {
				finishVerification(false, 'No accepted badge was found for this attendee.');
				return;
			}
			verificationMessage = 'Checking revocations and previous check-ins…';
			const awardIds = Array.from(awards.keys());
			const issuers = Array.from(new Set(Array.from(awards.values()).map((award) => award.issuer)));
			const revokedAwardIds = new Set<string>();
			const consumptions: Consumption[] = [];
			verificationSubscriptions.push(useSubscription(
				`event_checkin_audit_${presentation.id}`,
				[
					{ kinds: [5], authors: issuers, tags: { '#e': awardIds }, limit: 100, relays: [checkInContext.community], cacheFirst: true },
					{ kinds: [27237], tags: { '#e': awardIds, '#p': [presentation.pubkey], '#a': checkInContext.badgeAddresses }, limit: 500, relays: [checkInContext.community], cacheFirst: true }
				],
				(message: WorkerMessage) => {
					const event = isParsedEvent(message);
					if (!event) return;
					const tags = parsedEventTags(event);
					const awardId = tags.find((tag) => tag[0] === 'e')?.[1];
					if (!awardId || !awards.has(awardId)) return;
					if (event.kind() === 5) {
						if (event.pubkey() === awards.get(awardId)?.issuer) revokedAwardIds.add(awardId);
						return;
					}
					if (event.kind() !== 27237 || tags.find((tag) => tag[0] === 'type')?.[1] !== 'badge_consumption') return;
					const signer = event.pubkey();
					const eventAddress = tags.find((tag) => tag[0] === 'event')?.[1];
					const badgeAddress = tags.find((tag) => tag[0] === 'a')?.[1];
					if (!signer || !eventAddress || badgeAddress !== awards.get(awardId)?.address) return;
					if (signer !== eventAddress.split(':')[1]) return;
					consumptions.push({ awardId, eventAddress, signer });
				},
				{ bytesPerEvent: 10 * 1024 }
			));

			verificationTimeout = setTimeout(() => {
				const usableAward = Array.from(awards.values()).find((award) => {
					if (!definitions.has(award.address) || revokedAwardIds.has(award.id)) return false;
					const awardConsumptions = consumptions.filter((item) => item.awardId === award.id);
					if (awardConsumptions.some((item) => item.eventAddress === checkInContext.eventAddress)) return false;
					const maxUses = definitions.get(award.address)?.maxUses;
					return !maxUses || awardConsumptions.length < maxUses;
				});
				if (!usableAward) {
					finishVerification(false, 'The matching badge is revoked, exhausted, or already checked in.');
					return;
				}
				verificationMessage = 'Recording badge use…';
				const consumption: EventTemplate = {
					kind: 27237,
					created_at: Math.floor(Date.now() / 1000),
					content: '',
					tags: [
						['type', 'badge_consumption'],
						['a', usableAward.address],
						['e', usableAward.id],
						['p', presentation.pubkey],
						['event', checkInContext.eventAddress],
						['uses', '1']
					]
				};
				consumptionPublish = usePublish(
					`event_checkin_consume_${presentation.id}`,
					consumption,
					(message: WorkerMessage) => {
						const status = isConnectionStatus(message);
						if (status?.status() === 'true') finishVerification(true, 'Badge verified and check-in recorded.');
					},
					{ trackStatus: true, defaultRelays: [checkInContext.community] }
				);
				verificationTimeout = setTimeout(() => {
					finishVerification(false, 'The badge was valid, but its use could not be recorded.');
				}, 5000);
			}, 2000);
		}, 2500);
		return true;
	}

	const qrCodeSuccessCallback: QrcodeSuccessCallback = (decodedText, decodedResult) => {
		console.log('[scan] QR detected:', decodedText.substring(0, 50) + '...');
		if (verifyCheckIn(decodedText)) return;
		if (checkInContext) return;
		
		if (isLightningInvoice(decodedText)) {
			console.log('[scan] Lightning invoice detected');
			// Strip "lightning:" prefix if present (BIP-21 URI format)
			scannedInvoice = decodedText.startsWith('lightning:') ? decodedText.slice(10) : decodedText;
			view = 'melt';
			stop();
		} else if (isValidLNURL(decodedText)) {
			console.log('[scan] LNURL detected');
			scannedInvoice = decodedText;
			view = 'melt';
			stop();
		} else if (isNpub(decodedText)) {
			scannedPubkey = nip19.decode(decodedText).data as string;
			view = 'profile';
			stop();
		} else if (isNostr(decodedText)) {
			scannedPubkey = nip19.decode(decodedText.slice(6)).data as string;
			view = 'profile';
			stop();
		}
	};

	const qrCodeErrorCallback: QrcodeErrorCallback = (decodedText, decodedResult) => {
		/* handle error */
	};

	const config = { fps: 10, qrbox: { width: 250, height: 250 } };

	let html5QrCode: Html5Qrcode;

	async function start() {
		if (!mounted || view !== 'scan' || !readerElement?.isConnected) return;
		if (html5QrCode) await stop();
		if (!mounted || view !== 'scan' || !readerElement?.isConnected) return;
		html5QrCode = new Html5Qrcode(readerElement.id);

		await html5QrCode.start(
			{ facingMode: 'environment' },
			config,
			qrCodeSuccessCallback,
			qrCodeErrorCallback
		);
	}

	async function stop() {
		if (!html5QrCode) return;
		try {
			if (html5QrCode.isScanning) await html5QrCode.stop();
		} catch {
			// The camera may already have stopped while changing views.
		}
	}

	onMount(() => {
		mounted = true;
		startTimer = setTimeout(start, 0);
		return () => {
			mounted = false;
			if (startTimer) clearTimeout(startTimer);
			void stop();
		};
	});

	onDestroy(() => {
		clearVerificationWork();
	});
</script>

{#if view === 'scan'}
	<div class="relative h-screen bg-[#07120f] bg-opacity-95 flex items-center pt-safe">
		{#if checkInContext}
			<div class="absolute left-0 right-0 top-0 z-10 bg-[#15372c] px-5 pb-5 pt-safe text-white shadow-xl">
				<p class="pt-4 text-xs font-black uppercase tracking-[0.14em] text-white/55">Event check-in</p>
				<h1 class="mt-1 truncate text-xl font-black">{checkInContext.eventTitle}</h1>
				<p class="mt-1 text-sm font-semibold text-white/65">Scan the attendee's signed Nuts pass</p>
			</div>
		{/if}
		<div id="reader" bind:this={readerElement} class="w-full bg-white blur-0 h-auto"></div>
	</div>
{:else if view === 'melt'}
	<div class="h-screen bg-base-300 bg-opacity-95 relative">
		<!-- Back button to return to scanner -->
		<button
			class="absolute top-4 left-4 z-50 btn btn-circle btn-sm"
			on:click={goBackToScan}
		>
			<Icon icon="mdi:arrow-left" class="text-lg" />
		</button>
		<Melt invoice={scannedInvoice} />
	</div>
{:else if view === 'profile'}
	<div class="h-screen bg-base-300 bg-opacity-95 relative">
		<!-- Back button to return to scanner -->
		<button
			class="absolute top-4 left-4 z-50 btn btn-circle btn-sm"
			on:click={goBackToScan}
		>
			<Icon icon="mdi:arrow-left" class="text-lg" />
		</button>
		<Kind0 pubkey={scannedPubkey} {visible} goBack={goBackToScan} />
	</div>
{:else if view === 'verification'}
	<div class={`flex h-screen flex-col items-center justify-center px-6 text-center pt-safe ${verificationState === 'admitted' ? 'bg-emerald-950 text-white' : verificationState === 'rejected' ? 'bg-rose-950 text-white' : 'bg-[#eef5f3] text-[#15372c]'}`}>
		<div class={`grid h-24 w-24 place-items-center rounded-full ${verificationState === 'admitted' ? 'bg-emerald-400/15' : verificationState === 'rejected' ? 'bg-rose-400/15' : 'bg-white'}`}>
			<Icon icon={verificationState === 'admitted' ? 'heroicons:check' : verificationState === 'rejected' ? 'heroicons:x-mark' : 'ei:spinner'} class={`h-14 w-14 ${verificationState === 'checking' ? 'animate-spin' : ''}`} />
		</div>
		<p class="mt-6 text-sm font-black uppercase tracking-[0.16em] opacity-60">
			{verificationState === 'admitted' ? 'Admitted' : verificationState === 'rejected' ? 'Not admitted' : 'Checking'}
		</p>
		<h1 class="mt-2 text-4xl font-black tracking-[-0.04em]">{checkInContext?.eventTitle}</h1>
		{#if scannedPubkey}
			<div class="mt-6 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left">
				<Avatar pubkey={scannedPubkey} size="lg" />
				<div class="min-w-0">
					<p class="truncate font-black"><User pubkey={scannedPubkey} relays={checkInContext ? [checkInContext.community] : []} link={false} /></p>
					<p class="mt-0.5 font-mono text-xs opacity-60">{scannedPubkey.slice(0, 12)}…{scannedPubkey.slice(-8)}</p>
				</div>
			</div>
		{/if}
		<p class="mt-5 max-w-sm text-base font-semibold leading-7 opacity-75">{verificationMessage}</p>
		{#if verificationState !== 'checking'}
			<button type="button" class="mt-8 h-14 min-w-56 rounded-2xl bg-white px-6 text-lg font-black text-[#15372c] shadow-xl" on:click={goBackToScan}>Scan next attendee</button>
		{/if}
	</div>
{/if}
