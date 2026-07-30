<script lang="ts">
	import { Html5Qrcode, type QrcodeErrorCallback, type QrcodeSuccessCallback } from 'html5-qrcode';
	import { isLightningInvoice, isNostr, isNpub, isValidLNURL } from 'src/lib/wallet';
	import { nip19, type EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import { getContext, onDestroy, onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import {
		extractTagValue,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isParsedEvent } from '@candypoets/nipworker/utils';
	import { key } from 'src/controller';
	import {
		badgeDefinitionHasTypeTopic,
		catalogEventAddress,
		catalogMaxUses,
		catalogName,
		catalogProductKind,
		catalogType,
		catalogUsesQrFulfillment,
		isSellableCatalogDefinition,
		isSellableEventAccessDefinition
	} from 'src/lib/catalog';
	import { fetchCommunityAccess, fetchCommunityTrust } from 'src/lib/adminAccess';
	import {
		BADGE_STATUS_KIND,
		buildBadgeStatusTemplate,
		nextStatusCreatedAt
	} from 'src/lib/orders';
	import {
		decodeCheckInContext,
		decodeEntitlementPresentation,
		decodePresentation,
		type EntitlementPresentation,
		verifyEntitlementPresentation,
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
	let verificationState: 'checking' | 'confirming' | 'admitted' | 'rejected' = 'checking';
	let verificationMessage = '';
	let verificationTitle = '';
	let verificationResultLabel = '';
	let verificationSubscriptions: (() => void)[] = [];
	let badgeStatusPublish: (() => void) | undefined;
	let verificationTimeout: ReturnType<typeof setTimeout> | undefined;
	let entitlementVerificationAttempt = 0;
	let readerElement: HTMLDivElement;
	let startTimer: ReturnType<typeof setTimeout> | undefined;
	let mounted = false;
	let communityBadgeIssuer = '';
	let redemptionCandidate:
		| {
				community: string;
				presentationId: string;
				tags: string[][];
				actionLabel: string;
				successMessage: string;
				latestStatusCreatedAt: number;
		  }
		| undefined;

	type BadgeDefinition = { address: string; maxUses?: number };
	type BadgeAward = {
		id: string;
		address: string;
		issuer: string;
		expiresAt?: number;
	};
	const badgeStatuses = [
		'pending',
		'accepted',
		'processing',
		'ready',
		'fulfilled',
		'cancelled'
	] as const;
	type BadgeStatus = (typeof badgeStatuses)[number];
	type BadgeStatusRecord = {
		awardId: string;
		eventAddress: string;
		status: BadgeStatus;
		createdAt: number;
		id: string;
	};

	function isBadgeStatus(value: string | undefined): value is BadgeStatus {
		return badgeStatuses.includes(value as BadgeStatus);
	}

	// For Kind0 component
	let visible = true;

	function clearVerificationWork() {
		for (const unsubscribe of verificationSubscriptions) unsubscribe();
		verificationSubscriptions = [];
		badgeStatusPublish?.();
		badgeStatusPublish = undefined;
		if (verificationTimeout) clearTimeout(verificationTimeout);
		verificationTimeout = undefined;
	}

	function goBackToScan() {
		view = 'scan';
		scannedInvoice = '';
		scannedPubkey = '';
		verificationState = 'checking';
		verificationMessage = '';
		verificationTitle = '';
		verificationResultLabel = '';
		redemptionCandidate = undefined;
		clearVerificationWork();
		// Restart scanning
		startTimer = setTimeout(start, 100);
	}

	function finishVerification(admitted: boolean, message: string) {
		clearVerificationWork();
		verificationState = admitted ? 'admitted' : 'rejected';
		verificationMessage = message;
		verificationResultLabel = admitted ? verificationResultLabel || 'Completed' : 'Not accepted';
	}

	function communityServiceUrl(relay: string) {
		if (relay.startsWith('wss://')) return `https://${relay.slice(6)}`;
		if (relay.startsWith('ws://')) return `http://${relay.slice(5)}`;
		return relay;
	}

	async function fetchCommunityBadgeIssuer() {
		if (!checkInContext) return;
		try {
			const response = await fetch(
				new URL('/community/info', communityServiceUrl(checkInContext.community))
			);
			if (!response.ok) return;
			const info = (await response.json()) as {
				badge_issuer?: unknown;
				booking_issuer?: unknown;
			};
			const issuer =
				typeof info.badge_issuer === 'string'
					? info.badge_issuer
					: typeof info.booking_issuer === 'string'
						? info.booking_issuer
						: '';
			if (/^[0-9a-f]{64}$/i.test(issuer)) communityBadgeIssuer = issuer.toLowerCase();
		} catch {
			communityBadgeIssuer = '';
		}
	}

	function verifyCheckIn(decodedText: string) {
		if (!checkInContext) return false;
		const presentation = decodePresentation(decodedText);
		if (!presentation) return false;
		stop();
		view = 'verification';
		scannedPubkey = presentation.pubkey;
		verificationState = 'checking';
		verificationTitle = checkInContext.eventTitle;
		verificationResultLabel = 'Admitted';
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
		if (!communityBadgeIssuer) {
			finishVerification(false, 'The community badge issuer could not be resolved.');
			return true;
		}

		verificationMessage = 'Resolving accepted badge definitions…';
		const definitions = new Map<string, BadgeDefinition>();
		const awards = new Map<string, BadgeAward>();
		const definitionRequests: RequestObject[] = checkInContext.badgeAddresses.flatMap((address) => {
			const [kind, author, ...dParts] = address.split(':');
			const d = dParts.join(':');
			return kind === '30009' && author && d
				? [
						{
							kinds: [30009],
							authors: [author],
							tags: { '#d': [d] },
							limit: 1,
							relays: [checkInContext.community],
							cacheFirst: true
						}
					]
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
		verificationSubscriptions.push(
			useSubscription(
				`event_checkin_discovery_${presentation.id}`,
				discoveryRequests,
				(message: WorkerMessage) => {
					const event = isParsedEvent(message);
					if (!event) return;
					if (event.kind() === 30009) {
						const issuer = event.pubkey();
						const d = extractTagValue(event, 'd');
						if (!issuer || !d) return;
						const address = `30009:${issuer}:${d}`;
						if (!checkInContext.badgeAddresses.includes(address)) return;
						const type = catalogType(event);
						const maxUsesValue = catalogMaxUses(event);
						const isRole =
							extractTagValue(event, 'type') === 'role' &&
							badgeDefinitionHasTypeTopic(event, 'role');
						const isEventPass =
							type === 'event_access' &&
							isSellableEventAccessDefinition(event) &&
							catalogEventAddress(event) === checkInContext.eventAddress;
						if (!isRole && !isEventPass && !isSellableCatalogDefinition(event)) return;
						definitions.set(address, {
							address,
							maxUses:
								maxUsesValue && Number.isSafeInteger(maxUsesValue)
									? maxUsesValue
									: isEventPass
										? 1
										: undefined
						});
						return;
					}
					if (event.kind() !== 8) return;
					const address = extractTagValue(event, 'a');
					const recipient = extractTagValue(event, 'p');
					const issuer = event.pubkey();
					const id = event.id();
					const expiration = Number(extractTagValue(event, 'expiration') || 0);
					if (!address || !issuer || !id || recipient !== presentation.pubkey) return;
					if (!checkInContext.badgeAddresses.includes(address) || issuer !== communityBadgeIssuer)
						return;
					if (expiration && expiration <= Math.floor(Date.now() / 1000)) return;
					awards.set(id, {
						id,
						address,
						issuer,
						expiresAt: expiration || undefined
					});
				},
				{ bytesPerEvent: 10 * 1024 }
			)
		);

		verificationTimeout = setTimeout(() => {
			if (!awards.size) {
				finishVerification(false, 'No accepted badge was found for this attendee.');
				return;
			}
			verificationMessage = 'Checking revocations and previous check-ins…';
			const awardIds = Array.from(awards.keys());
			const issuers = Array.from(new Set(Array.from(awards.values()).map((award) => award.issuer)));
			const revokedAwardIds = new Set<string>();
			const badgeStatusRecords = new Map<string, BadgeStatusRecord>();
			verificationSubscriptions.push(
				useSubscription(
					`event_checkin_audit_${presentation.id}`,
					[
						{
							kinds: [5],
							authors: issuers,
							tags: { '#e': awardIds },
							limit: 100,
							relays: [checkInContext.community],
							cacheFirst: true
						},
						{
							kinds: [BADGE_STATUS_KIND],
							tags: {
								'#e': awardIds,
								'#p': [presentation.pubkey],
								'#a': checkInContext.badgeAddresses
							},
							limit: 500,
							relays: [checkInContext.community],
							cacheFirst: true
						}
					],
					(message: WorkerMessage) => {
						const event = isParsedEvent(message);
						if (!event) return;
						const awardId = extractTagValue(event, 'e');
						if (!awardId || !awards.has(awardId)) return;
						if (event.kind() === 5) {
							if (event.pubkey() === awards.get(awardId)?.issuer) revokedAwardIds.add(awardId);
							return;
						}
						if (event.kind() !== BADGE_STATUS_KIND) return;
						const signer = event.pubkey();
						const id = event.id();
						const eventAddress = extractTagValue(event, 'event');
						const badgeAddress = extractTagValue(event, 'a');
						const status = extractTagValue(event, 'status');
						if (
							!signer ||
							!id ||
							!eventAddress ||
							!isBadgeStatus(status) ||
							badgeAddress !== awards.get(awardId)?.address
						)
							return;
						if (signer !== eventAddress.split(':')[1]) return;
						const record: BadgeStatusRecord = {
							awardId,
							eventAddress,
							status,
							createdAt: Number(event.createdAt()),
							id
						};
						const recordKey = `${awardId}:${eventAddress}`;
						const existing = badgeStatusRecords.get(recordKey);
						if (
							!existing ||
							record.createdAt > existing.createdAt ||
							(record.createdAt === existing.createdAt && record.id > existing.id)
						) {
							badgeStatusRecords.set(recordKey, record);
						}
					},
					{ bytesPerEvent: 10 * 1024 }
				)
			);

			verificationTimeout = setTimeout(() => {
				const usableAward = Array.from(awards.values()).find((award) => {
					if (!definitions.has(award.address) || revokedAwardIds.has(award.id)) return false;
					const fulfilledUses = Array.from(badgeStatusRecords.values()).filter(
						(item) => item.awardId === award.id && item.status === 'fulfilled'
					);
					if (fulfilledUses.some((item) => item.eventAddress === checkInContext.eventAddress))
						return false;
					const maxUses = definitions.get(award.address)?.maxUses;
					return !maxUses || fulfilledUses.length < maxUses;
				});
				if (!usableAward) {
					finishVerification(
						false,
						'The matching badge is revoked, exhausted, or already checked in.'
					);
					return;
				}
				verificationMessage = 'Recording badge use…';
				const badgeStatus: EventTemplate = buildBadgeStatusTemplate('fulfilled', {
					awardId: usableAward.id,
					badgeAddress: usableAward.address,
					holder: presentation.pubkey,
					contextTag: ['event', checkInContext.eventAddress]
				});
				badgeStatusPublish = usePublish(
					`event_checkin_status_${presentation.id}`,
					badgeStatus,
					(message: WorkerMessage) => {
						const status = isConnectionStatus(message);
						if (status?.status() === 'true')
							finishVerification(true, 'Badge verified and check-in recorded.');
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

	function latestStatusByContext(events: ParsedEvent[]) {
		const latest = new Map<string, ParsedEvent>();
		for (const event of events) {
			const order = extractTagValue(event, 'order');
			const eventAddress = extractTagValue(event, 'event');
			if (Boolean(order) === Boolean(eventAddress)) continue;
			const expectedContext = order ? `order:${order}` : `event:${eventAddress}`;
			const context = extractTagValue(event, 'd');
			if (context !== expectedContext) continue;
			const current = latest.get(context);
			if (
				!current ||
				event.createdAt() > current.createdAt() ||
				(event.createdAt() === current.createdAt() && (event.id() || '') < (current.id() || ''))
			) {
				latest.set(context, event);
			}
		}
		return latest;
	}

	function redemptionAction(
		type: ReturnType<typeof catalogType>,
		productKind: ReturnType<typeof catalogProductKind>
	) {
		if (type === 'event_access') {
			return {
				actionLabel: 'Check in',
				successMessage: 'Ticket checked in.',
				resultLabel: 'Admitted'
			};
		}
		if (type === 'pass' || type === 'membership') {
			return {
				actionLabel: 'Record check-in',
				successMessage: 'Check-in recorded.',
				resultLabel: 'Checked in'
			};
		}
		if (productKind === 'food' || productKind === 'drink') {
			return {
				actionLabel: 'Mark served',
				successMessage: 'Order marked as served.',
				resultLabel: 'Served'
			};
		}
		if (productKind === 'merchandise') {
			return {
				actionLabel: 'Mark collected',
				successMessage: 'Order marked as collected.',
				resultLabel: 'Collected'
			};
		}
		return {
			actionLabel: 'Fulfill order',
			successMessage: 'Order marked as fulfilled.',
			resultLabel: 'Fulfilled'
		};
	}

	function verifyEntitlementRedemption(decodedText: string) {
		const presentation = decodeEntitlementPresentation(decodedText);
		if (!presentation) return false;
		stop();
		view = 'verification';
		scannedPubkey = presentation.event.pubkey;
		verificationState = 'checking';
		verificationTitle = 'Entitlement';
		verificationResultLabel = '';
		verificationMessage = 'Verifying signed entitlement…';
		redemptionCandidate = undefined;
		void prepareEntitlementRedemption(presentation);
		return true;
	}

	async function signerCanFulfill(
		community: string,
		pubkey: string,
		permission: 'store' | 'events'
	) {
		const trust = await fetchCommunityTrust(community);
		if (trust.authorityPubkeys.has(pubkey)) return true;
		const access = await fetchCommunityAccess(community, pubkey, false);
		return access.permissions.has(permission);
	}

	async function prepareEntitlementRedemption(presentation: EntitlementPresentation) {
		if (!verifyEntitlementPresentation(presentation)) {
			finishVerification(false, 'This QR presentation is invalid or has expired.');
			return;
		}
		const staffPubkey = $key?.pub;
		if (!staffPubkey || $key?.hasSigner === false) {
			finishVerification(false, 'Sign in with an authorized staff account to fulfill this item.');
			return;
		}

		let community = '';
		try {
			community = normalizeURL(presentation.community);
		} catch {
			finishVerification(false, 'The QR does not contain a valid community relay.');
			return;
		}
		if (
			checkInContext &&
			(normalizeURL(checkInContext.community) !== community ||
				presentation.eventAddress !== checkInContext.eventAddress)
		) {
			finishVerification(false, 'This ticket belongs to a different event or community.');
			return;
		}

		const [, definitionAuthor, ...definitionDParts] = presentation.badgeAddress.split(':');
		const definitionD = definitionDParts.join(':');
		let award: ParsedEvent | undefined;
		let definition: ParsedEvent | undefined;
		const revocationSigners = new Set<string>();
		const rawStatuses: ParsedEvent[] = [];
		verificationMessage = 'Loading entitlement and fulfillment history…';
		// A fresh subscription id per scan attempt: nipworker dedupes re-used ids,
		// so re-scanning the same presentation would otherwise resolve from the
		// pre-fulfillment cache without any relay round-trip.
		entitlementVerificationAttempt += 1;
		const entitlementFilters: RequestObject[] = [
			{
				kinds: [8],
				ids: [presentation.awardId],
				limit: 1,
				relays: [community],
				cacheFirst: true
			},
			{
				kinds: [30009],
				authors: [definitionAuthor],
				tags: { '#d': [definitionD] },
				limit: 20,
				relays: [community],
				cacheFirst: true
			},
			{
				kinds: [BADGE_STATUS_KIND],
				tags: {
					'#e': [presentation.awardId],
					'#a': [presentation.badgeAddress],
					'#p': [presentation.event.pubkey]
				},
				limit: 500,
				relays: [community],
				cacheFirst: true
			},
			{
				kinds: [5],
				tags: { '#e': [presentation.awardId] },
				limit: 50,
				relays: [community],
				cacheFirst: true
			}
		];
		// nipworker sends each filter as its own REQ under one subscription id, so
		// the relay answers with one EOSE per filter; only verify after all of them.
		let eoseCount = 0;
		verificationSubscriptions.push(
			useSubscription(
				`entitlement_redemption_${presentation.event.id}_${entitlementVerificationAttempt}`,
				entitlementFilters,
				(message: WorkerMessage) => {
					const connectionStatus = isConnectionStatus(message);
					if (connectionStatus?.status() === 'EOSE') {
						eoseCount += 1;
						if (eoseCount >= entitlementFilters.length) void runVerification();
						return;
					}
					const event = isParsedEvent(message);
					if (!event) return;
					if (event.kind() === 8) {
						if (
							event.id() === presentation.awardId &&
							extractTagValue(event, 'a') === presentation.badgeAddress &&
							extractTagValue(event, 'p') === presentation.event.pubkey
						) {
							award = event;
						}
						return;
					}
					if (event.kind() === 30009) {
						if (
							event.pubkey() !== definitionAuthor ||
							extractTagValue(event, 'd') !== definitionD ||
							!isSellableCatalogDefinition(event)
						) {
							return;
						}
						if (
							!definition ||
							event.createdAt() > definition.createdAt() ||
							(event.createdAt() === definition.createdAt() &&
								(event.id() || '') < (definition.id() || ''))
						) {
							definition = event;
						}
						return;
					}
					if (event.kind() === 5) {
						if (event.pubkey()) revocationSigners.add(event.pubkey()!);
						return;
					}
					if (
						event.kind() === BADGE_STATUS_KIND &&
						extractTagValue(event, 'e') === presentation.awardId &&
						extractTagValue(event, 'a') === presentation.badgeAddress &&
						extractTagValue(event, 'p') === presentation.event.pubkey &&
						isBadgeStatus(extractTagValue(event, 'status')) &&
						!rawStatuses.some((status) => status.id() === event.id())
					) {
						rawStatuses.push(event);
					}
				},
				{ bytesPerEvent: 12 * 1024 }
			)
		);

		let verificationResolved = false;
		const runVerification = async () => {
			if (verificationResolved) return;
			verificationResolved = true;
			if (verificationTimeout) clearTimeout(verificationTimeout);
			verificationTimeout = undefined;
			if (!award || !definition) {
				finishVerification(false, 'The entitlement could not be found on this community relay.');
				return;
			}
			const trust = await fetchCommunityTrust(community);
			if (
				!award.pubkey() ||
				(!trust.authorityPubkeys.has(award.pubkey()!) && trust.badgeIssuer !== award.pubkey())
			) {
				finishVerification(false, 'The entitlement was not issued by this community.');
				return;
			}
			if (award.pubkey() && revocationSigners.has(award.pubkey()!)) {
				finishVerification(false, 'This entitlement has been revoked.');
				return;
			}
			const expiration = Number(extractTagValue(award, 'expiration') || 0);
			if (expiration && expiration <= Math.floor(Date.now() / 1000)) {
				finishVerification(false, 'This entitlement has expired.');
				return;
			}

			const type = catalogType(definition);
			const permission = type === 'event_access' ? 'events' : 'store';
			if (!type || !(await signerCanFulfill(community, staffPubkey, permission))) {
				finishVerification(false, `This account does not have ${permission} permission.`);
				return;
			}
			if (
				(type === 'event_access' &&
					(!presentation.eventAddress ||
						catalogEventAddress(definition) !== presentation.eventAddress)) ||
				(type !== 'event_access' && !presentation.orderId)
			) {
				finishVerification(false, 'The QR fulfillment context does not match this entitlement.');
				return;
			}
			const productKind = catalogProductKind(definition);
			if (!catalogUsesQrFulfillment(definition)) {
				finishVerification(false, 'This product does not use QR fulfillment.');
				return;
			}

			const statusAuthorization = new Map<string, Promise<boolean>>();
			const statusSignerPermissions = await Promise.all(
				rawStatuses.map((status) => {
					const signer = status.pubkey();
					if (!signer) return false;

					let authorization = statusAuthorization.get(signer);
					if (!authorization) {
						authorization = signerCanFulfill(community, signer, permission);
						statusAuthorization.set(signer, authorization);
					}
					return authorization;
				})
			);
			const statuses = rawStatuses.filter((_, index) => statusSignerPermissions[index]);
			const latest = latestStatusByContext(statuses);
			const contextTag: ['order' | 'event', string] = presentation.orderId
				? ['order', presentation.orderId]
				: ['event', presentation.eventAddress || ''];
			const contextKey = `${contextTag[0]}:${contextTag[1]}`;
			const currentStatus = latest.get(contextKey);
			const currentValue = currentStatus ? extractTagValue(currentStatus, 'status') : undefined;
			if (currentValue === 'fulfilled') {
				finishVerification(
					false,
					type === 'event_access'
						? 'This ticket was already checked in.'
						: 'This entitlement was already used.'
				);
				return;
			}
			if (currentValue === 'cancelled') {
				finishVerification(false, 'This fulfillment was cancelled.');
				return;
			}
			const maxUses = catalogMaxUses(definition);
			const fulfilledUses = Array.from(latest.values()).filter(
				(status) => extractTagValue(status, 'status') === 'fulfilled'
			).length;
			if (maxUses && fulfilledUses >= maxUses) {
				finishVerification(false, 'This entitlement has no uses remaining.');
				return;
			}

			const action = redemptionAction(type, productKind);
			verificationState = 'confirming';
			verificationTitle =
				type === 'event_access' && checkInContext
					? checkInContext.eventTitle
					: catalogName(definition);
			verificationResultLabel = action.resultLabel;
			verificationMessage =
				type === 'product' && currentValue
					? `Current order status: ${currentValue}. Confirm the handover to fulfill it.`
					: 'Confirm this entitlement use.';
			redemptionCandidate = {
				community,
				presentationId: presentation.event.id,
				tags: [
					['status', 'fulfilled'],
					['a', presentation.badgeAddress],
					['e', presentation.awardId],
					['p', presentation.event.pubkey],
					contextTag,
					['d', contextKey]
				],
				actionLabel: action.actionLabel,
				successMessage: action.successMessage,
				latestStatusCreatedAt: currentStatus?.createdAt() || 0
			};
			clearVerificationWork();
		};

		// Resolve once every filter's EOSE arrived (all stored events delivered)
		// instead of a fixed window; the timeout is only a backstop for when EOSE
		// never arrives.
		verificationTimeout = setTimeout(() => void runVerification(), 12000);
	}

	function confirmEntitlementRedemption() {
		const candidate = redemptionCandidate;
		if (!candidate || verificationState !== 'confirming') return;
		verificationState = 'checking';
		verificationMessage = 'Recording fulfillment…';
		const template: EventTemplate = {
			kind: BADGE_STATUS_KIND,
			// Keep created_at strictly past the current status for this context:
			// a same-second fulfillment can lose the reader-side id tie-break.
			created_at: nextStatusCreatedAt(candidate.latestStatusCreatedAt),
			content: '',
			tags: candidate.tags
		};
		badgeStatusPublish = usePublish(
			`entitlement_fulfillment_${candidate.presentationId}`,
			template,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status?.status() === 'true' || status?.status() === 'OK') {
					finishVerification(true, candidate.successMessage);
				}
			},
			{ trackStatus: true, defaultRelays: [candidate.community] }
		);
		verificationTimeout = setTimeout(() => {
			finishVerification(false, 'The entitlement was valid, but fulfillment was not recorded.');
		}, 5000);
	}

	const qrCodeSuccessCallback: QrcodeSuccessCallback = (decodedText, decodedResult) => {
		// html5-qrcode can deliver late decodes from its backlog while stop() is
		// still resolving; every handler leaves the scan view synchronously, so
		// only the first detection may drive the flow.
		if (view !== 'scan') return;
		console.log('[scan] QR detected:', decodedText.substring(0, 50) + '...');
		if (verifyEntitlementRedemption(decodedText)) return;
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
		void fetchCommunityBadgeIssuer().finally(() => {
			startTimer = setTimeout(start, 0);
		});
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
			<div
				class="absolute left-0 right-0 top-0 z-10 bg-[#15372c] px-5 pb-5 pt-safe text-white shadow-xl"
			>
				<p class="pt-4 text-xs font-black uppercase tracking-[0.14em] text-white/55">
					Event check-in
				</p>
				<h1 class="mt-1 truncate text-xl font-black">{checkInContext.eventTitle}</h1>
				<p class="mt-1 text-sm font-semibold text-white/65">Scan the attendee's signed Nuts pass</p>
			</div>
		{/if}
		<div id="reader" bind:this={readerElement} class="w-full bg-white blur-0 h-auto"></div>
	</div>
{:else if view === 'melt'}
	<div class="h-screen bg-base-300 bg-opacity-95 relative">
		<!-- Back button to return to scanner -->
		<button class="absolute top-4 left-4 z-50 btn btn-circle btn-sm" on:click={goBackToScan}>
			<Icon icon="mdi:arrow-left" class="text-lg" />
		</button>
		<Melt invoice={scannedInvoice} />
	</div>
{:else if view === 'profile'}
	<div class="h-screen bg-base-300 bg-opacity-95 relative">
		<!-- Back button to return to scanner -->
		<button class="absolute top-4 left-4 z-50 btn btn-circle btn-sm" on:click={goBackToScan}>
			<Icon icon="mdi:arrow-left" class="text-lg" />
		</button>
		<Kind0 pubkey={scannedPubkey} {visible} goBack={goBackToScan} />
	</div>
{:else if view === 'verification'}
	<div
		class={`flex h-screen flex-col items-center justify-center px-6 text-center pt-safe ${verificationState === 'admitted' ? 'bg-emerald-950 text-white' : verificationState === 'rejected' ? 'bg-rose-950 text-white' : 'bg-[#eef5f3] text-[#15372c]'}`}
	>
		<div
			class={`grid h-24 w-24 place-items-center rounded-full ${verificationState === 'admitted' ? 'bg-emerald-400/15' : verificationState === 'rejected' ? 'bg-rose-400/15' : 'bg-white'}`}
		>
			<Icon
				icon={verificationState === 'admitted'
					? 'heroicons:check'
					: verificationState === 'rejected'
						? 'heroicons:x-mark'
						: verificationState === 'confirming'
							? 'mdi:qrcode-scan'
							: 'ei:spinner'}
				class={`h-14 w-14 ${verificationState === 'checking' ? 'animate-spin' : ''}`}
			/>
		</div>
		<p class="mt-6 text-sm font-black uppercase tracking-[0.16em] opacity-60">
			{verificationState === 'admitted'
				? verificationResultLabel || 'Completed'
				: verificationState === 'rejected'
					? verificationResultLabel || 'Not accepted'
					: verificationState === 'confirming'
						? 'Confirm fulfillment'
						: 'Checking'}
		</p>
		<h1 class="mt-2 text-4xl font-black tracking-[-0.04em]">{verificationTitle}</h1>
		{#if scannedPubkey}
			<div class="mt-6 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left">
				<Avatar pubkey={scannedPubkey} size="lg" />
				<div class="min-w-0">
					<p class="truncate font-black">
						<User
							pubkey={scannedPubkey}
							relays={checkInContext
								? [checkInContext.community]
								: redemptionCandidate
									? [redemptionCandidate.community]
									: []}
							link={false}
						/>
					</p>
					<p class="mt-0.5 font-mono text-xs opacity-60">
						{scannedPubkey.slice(0, 12)}…{scannedPubkey.slice(-8)}
					</p>
				</div>
			</div>
		{/if}
		<p class="mt-5 max-w-sm text-base font-semibold leading-7 opacity-75">{verificationMessage}</p>
		{#if verificationState === 'confirming' && redemptionCandidate}
			<button
				type="button"
				class="mt-8 h-14 min-w-56 rounded-2xl bg-[#15372c] px-6 text-lg font-black text-white shadow-xl"
				on:click={confirmEntitlementRedemption}
			>
				{redemptionCandidate.actionLabel}
			</button>
			<button
				type="button"
				class="mt-3 h-11 min-w-56 rounded-xl border border-[#15372c]/25 px-5 font-black"
				on:click={goBackToScan}
			>
				Cancel
			</button>
		{:else if verificationState !== 'checking'}
			<button
				type="button"
				class="mt-8 h-14 min-w-56 rounded-2xl bg-white px-6 text-lg font-black text-[#15372c] shadow-xl"
				on:click={goBackToScan}>Scan next</button
			>
		{/if}
	</div>
{/if}
