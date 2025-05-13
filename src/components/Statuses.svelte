<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { nostrManager, type RelayStatus } from 'src/model/nostr';
	import StatusCircle from './StatusCircle.svelte';

	// Store active and recently completed publish statuses
	type StatusEntry = {
		relay: string;
		status: RelayStatus;
		eventId: string;
		timestamp: number;
		expiryTimer?: number;
	};

	let statuses: StatusEntry[] = [];

	// Map to keep track of which relays belong to which events
	// Used to update the correct status entries and manage cleanup
	const eventRelayMap = new Map<string, Set<string>>();

	// Constants
	const DISPLAY_DURATION_MS = 5000; // 5 seconds to show completed statuses

	// Add a status update to the list
	function updateStatus(status: RelayStatus, eventId: string) {
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
	function handleStatusClick(event: CustomEvent) {
		console.log('Status clicked:', event.detail);
	}

	// Get domain name from relay URL (for display purposes)
	function getRelayName(url: string): string {
		try {
			const domain = new URL(url).hostname;
			return domain.replace(/^www\./, '');
		} catch (e) {
			return url;
		}
	}

	onMount(() => {
		// Subscribe to publish status updates
		nostrManager.addPublishCallbackAll((status, eventId) => {
			updateStatus(status, eventId);
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
				relayName={getRelayName(entry.relay)}
				status={entry.status.status}
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
