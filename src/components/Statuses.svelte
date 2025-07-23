<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { nostrManager, type RelayStatus, PublishStatus } from '@candypoets/nipworker';
	import StatusCircle from './StatusCircle.svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { proxyUrl } from 'src/lib/proxy';

	// Store active and recently completed publish statuses
	type StatusEntry = {
		relay: string;
		status: any; // RelayStatusUpdate from pkg
		eventId: string;
		timestamp: number;
		expiryTimer?: number;
	};

	// NIP-11 relay information type
	type RelayInfo = {
		name?: string;
		description?: string;
		icon?: string;
		pubkey?: string;
		contact?: string;
		supported_nips?: number[];
		software?: string;
		version?: string;
	};

	let statuses: StatusEntry[] = [];

	// Map to keep track of which relays belong to which events
	// Used to update the correct status entries and manage cleanup
	const eventRelayMap = new Map<string, Set<string>>();

	// Cache for relay info to prevent duplicate fetches
	const relayInfoCache = new Map<string, RelayInfo>();

	// Track fetch attempts to avoid duplicate requests
	const fetchAttempts = new Set<string>();

	// Constants
	const DISPLAY_DURATION_MS = 5000; // 5 seconds to show completed statuses

	// Add a status update to the list
	function updateStatus(status: any, eventId: string) {
		const relayUrl = status.relay;
		const existingIndex = statuses.findIndex((s) => s.relay === relayUrl && s.eventId === eventId);

		// Track which relays belong to which events for cleanup
		if (!eventRelayMap.has(eventId)) {
			eventRelayMap.set(eventId, new Set());
		}
		eventRelayMap.get(eventId)?.add(relayUrl);

		const now = Date.now();

		if (existingIndex >= 0) {
			// Update existing status
			const entry = statuses[existingIndex];

			// Clear any existing expiry timer
			if (entry.expiryTimer) {
				clearTimeout(entry.expiryTimer);
			}

			// Set expiry timer for completed statuses
			let expiryTimer: number | undefined = undefined;

			if (status.status !== 'pending' && status.status !== 'sent') {
				expiryTimer = window.setTimeout(() => {
					statuses = statuses.filter((s) => s.relay !== relayUrl || s.eventId !== eventId);
				}, DISPLAY_DURATION_MS);
			}

			// Update the status
			statuses[existingIndex] = {
				...entry,
				status,
				timestamp: now,
				expiryTimer
			};

			// Trigger reactivity
			statuses = [...statuses];
		} else {
			// Create new status entry
			let expiryTimer: number | undefined = undefined;

			if (status.status !== 'pending' && status.status !== 'sent') {
				expiryTimer = window.setTimeout(() => {
					statuses = statuses.filter((s) => s.relay !== relayUrl || s.eventId !== eventId);
				}, DISPLAY_DURATION_MS);
			}

			statuses = [
				...statuses,
				{
					relay: relayUrl,
					status,
					eventId,
					timestamp: now,
					expiryTimer
				}
			];
		}
	}

	// Handle status clicks to show more details
	function handleStatusClick(event: CustomEvent) {}

	// Get domain name from relay URL (for display purposes)
	function getRelayName(url: string): string {
		try {
			const domain = new URL(url).hostname;
			return domain.replace(/^www\./, '');
		} catch (e) {
			return url;
		}
	}

	// Fetch relay information from NIP-11
	async function fetchRelayInfo(relayUrl: string): Promise<RelayInfo | null> {
		try {
			// Normalize and convert websocket URL to HTTP URL
			const normalizedUrl = normalizeURL(relayUrl);

			// Check cache first
			if (relayInfoCache.has(normalizedUrl)) {
				return relayInfoCache.get(normalizedUrl) || null;
			}

			// Check if we're already fetching this relay
			if (fetchAttempts.has(normalizedUrl)) {
				return null;
			}

			fetchAttempts.add(normalizedUrl);

			const httpUrl = normalizedUrl.replace('wss://', 'https://').replace('ws://', 'http://');

			// Use proxy to handle CORP policy
			const proxyedUrl = proxyUrl(httpUrl, 'resource');

			const response = await fetch(proxyedUrl, {
				headers: {
					Accept: 'application/nostr+json'
				}
			});

			if (response.ok) {
				const relayInfo: RelayInfo = await response.json();
				// Cache the result
				relayInfoCache.set(normalizedUrl, relayInfo);
				return relayInfo;
			} else {
				console.warn('Failed to fetch relay info - HTTP', response.status, response.statusText);
			}
		} catch (error) {
			console.log('Failed to fetch relay info for', relayUrl, error);
		} finally {
			fetchAttempts.delete(normalizeURL(relayUrl));
		}

		// Cache empty result to prevent retry
		relayInfoCache.set(normalizeURL(relayUrl), {});
		return null;
	}

	// Get relay info for a specific relay URL
	function getRelayInfo(relayUrl: string): RelayInfo | null {
		const normalizedUrl = normalizeURL(relayUrl);
		return relayInfoCache.get(normalizedUrl) || null;
	}

	onMount(() => {
		// Subscribe to publish status updates
		nostrManager.addPublishCallbackAll((status: any, eventId: string) => {
			updateStatus(status, eventId);
			// Fetch relay info for new relays (fire and forget)
			const normalizedUrl = normalizeURL(status.relay);
			if (!relayInfoCache.has(normalizedUrl) && !fetchAttempts.has(normalizedUrl)) {
				fetchRelayInfo(status.relay);
			}
		});
	});

	onDestroy(() => {
		// Clear all timeouts to prevent memory leaks
		statuses.forEach((entry) => {
			if (entry.expiryTimer) {
				clearTimeout(entry.expiryTimer);
			}
		});
	});
</script>

<div
	class="fixed h-[100vh] left-5 top-5 flex flex-col justify-center gap-3 z-50 pointer-events-none"
>
	{#each statuses as entry (entry.relay + entry.eventId)}
		<div
			class="pointer-events-auto"
			in:fly={{ y: -200, duration: 300 }}
			out:fly={{ x: -50, duration: 200 }}
		>
			<StatusCircle
				relayName={getRelayInfo(entry.relay)?.name || getRelayName(entry.relay)}
				relayInfo={getRelayInfo(entry.relay)}
				status={entry.status.status.toLowerCase() || 'pending'}
				errorMessage={entry.status.message}
				eventData={{
					eventId: entry.eventId,
					relay: entry.relay,
					timestamp: entry.status.timestamp
				}}
				on:click={handleStatusClick}
			/>
		</div>
	{/each}
</div>
