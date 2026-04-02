<script lang="ts">
	import ContentBlocks from './ContentBlocks.svelte';
	import {
		Kind1018Parsed,
		Kind1068Parsed,
		MessageType,
		type ConnectionStatus,
		type ParsedEvent,
		type WorkerMessage,
		PollType
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asParsedEvent,
		fbArray,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import Loader from 'src/components/Loader.svelte';
	import { nip19 } from 'nostr-tools';
	import { onDestroy, onMount } from 'svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key } from 'src/controller';
	import { updateSendStatus } from 'src/controller/sendStatus';

	export let note: ParsedEvent;
	export let visible: boolean = false;

	// Poll state
	let pollData: Kind1068Parsed | null = null;
	let votes: Map<string, Set<string>> = new Map(); // optionId -> Set of voter pubkeys
	let totalVotes = 0;
	let hasVoted = false;
	let userVotedOptions: Set<string> = new Set(); // Track which options user voted for
	let selectedOptions: Set<string> = new Set();
	let pollEnded = false;
	let sub: (() => void) | undefined;
	let connectionStatus: { [url: string]: ConnectionStatus } = {};
	let relayUrls: string[] = [];
	let isVoting = false; // Track vote submission state
	let processedVoteIds: Set<string> = new Set(); // Deduplication: track processed vote event IDs
	let voterTimestamps: Map<string, number> = new Map(); // Track latest vote timestamp per voter (NIP-1068 last-write-wins)

	// Computed vote stats - derived from votes Map for template use
	// Access this in template as $voteStatsMap.get(optionId)
	$: voteStatsMap = new Map(
		Array.from(votes.entries()).map(([optionId, voters]) => [
			optionId,
			{
				count: voters.size,
				percentage: totalVotes > 0 ? Math.round((voters.size / totalVotes) * 100) : 0
			}
		])
	);

	// Extract poll data from Kind1068Parsed
	function extractPollData(note: ParsedEvent): Kind1068Parsed | null {
		if (!note) return null;
		try {
			const parsed = note.parsed(new Kind1068Parsed());
			return parsed as Kind1068Parsed | null;
		} catch {
			return null;
		}
	}

	// Check if poll has ended
	function checkPollEnd(endsAt: bigint): boolean {
		if (!endsAt || endsAt === BigInt(0)) return false;
		return Date.now() > Number(endsAt) * 1000;
	}

	// Convert Uint8Array or string to string
	function toString(value: string | Uint8Array | null): string {
		if (!value) return '';
		if (typeof value === 'string') return value;
		return new TextDecoder().decode(value);
	}

	// Handle incoming vote events (kind 1018)
	function handleVoteEvents(message: WorkerMessage) {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				connectionStatus[normalizeURL(relayUrl)] = status;
			}
			return;
		}

		switch (message.type()) {
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (!parsedEvent) return;

				// Only process kind 1018 events (poll responses)
				if (parsedEvent.kind() !== 1018) return;

				// DEDUPLICATION: Skip if we've already processed this exact event ID
				const eventId = parsedEvent.id();
				if (!eventId) return;
				if (processedVoteIds.has(eventId)) return;
				processedVoteIds.add(eventId);
				let voteData: Kind1018Parsed | null = null;
				try {
					voteData = parsedEvent.parsed(new Kind1018Parsed()) as Kind1018Parsed;
				} catch {
					return;
				}

				if (!voteData) return;

				// Check if this vote is for our poll
				const pollEventId = voteData.pollEventId();
				if (!pollEventId || pollEventId !== note?.id()) return;

				// Get voter pubkey
				const voterPubkey = parsedEvent.pubkey();
				if (!voterPubkey) return;

				// NIP-1068 LAST-WRITE-WINS: Check timestamp against existing vote from this voter
				const voteTimestamp = Number(parsedEvent.createdAt() || 0);
				const existingTimestamp = voterTimestamps.get(voterPubkey) || 0;
				
				// Only process if this is the first vote OR newer than existing vote
				if (existingTimestamp > 0 && voteTimestamp <= existingTimestamp) {
					// This is an older vote, skip it (we already have a newer one)
					return;
				}
				// Update the timestamp tracker for this voter
				voterTimestamps.set(voterPubkey, voteTimestamp);

				// Check if this is the current user's vote
				const currentUserPubkey = $key?.pub;
				if (voterPubkey === currentUserPubkey) {
					hasVoted = true;
					isVoting = false; // Clear voting state when we see our own vote confirmed
				}

				// Get selected options from this vote
				const optionIds = fbArray(voteData, 'selectedOptions').map((id) => toString(id));

				// If this is the current user's vote, track which options they voted for
				if (voterPubkey === currentUserPubkey) {
					userVotedOptions = new Set(optionIds);
					selectedOptions = new Set(optionIds); // Sync selection with actual vote
				}

				// Update vote counts - overwrite any previous vote from this user
				// Svelte reactivity: create new Map and Sets to trigger updates
				const newVotes = new Map(votes);

				// First, remove this user from all existing options (create new Sets)
				newVotes.forEach((voters, optionId) => {
					if (voters.has(voterPubkey)) {
						newVotes.set(optionId, new Set([...voters].filter((p) => p !== voterPubkey)));
					}
				});

				// Add user to their selected options
				optionIds.forEach((optionId) => {
					const existingVoters = newVotes.get(optionId) || new Set();
					newVotes.set(optionId, new Set([...existingVoters, voterPubkey]));
				});

				votes = newVotes;

				// Recalculate totals
				recalculateTotals();
				break;
		}
	}

	// Recalculate total votes and unique voters
	function recalculateTotals() {
		const uniqueVoters = new Set<string>();
		votes.forEach((voters) => {
			voters.forEach((pubkey) => uniqueVoters.add(pubkey));
		});
		totalVotes = uniqueVoters.size;
	}

	// Get vote count for an option
	function getVoteCount(optionId: string): number {
		return votes.get(optionId)?.size || 0;
	}

	// Get vote percentage for an option
	function getVotePercentage(optionId: string): number {
		if (totalVotes === 0) return 0;
		const count = getVoteCount(optionId);
		return Math.round((count / totalVotes) * 100);
	}

	// Toggle option selection (for voting)
	function toggleOption(optionId: string) {
		if (pollEnded || hasVoted) return;

		if (pollData?.pollType() === PollType.SingleChoice) {
			// Single choice: select only one
			selectedOptions = new Set([optionId]);
		} else {
			// Multiple choice: toggle selection
			const newSelected = new Set(selectedOptions);
			if (newSelected.has(optionId)) {
				newSelected.delete(optionId);
			} else {
				newSelected.add(optionId);
			}
			selectedOptions = newSelected;
		}
	}

	// Cast vote (publish kind 1018 event) - optimistic UI
	async function castVote() {
		if (!$key?.pub || selectedOptions.size === 0 || isVoting) return;

		const noteId = note?.id();
		if (!noteId) return;

		isVoting = true;

		// Optimistic: mark as voted immediately for better UX
		hasVoted = true;
		userVotedOptions = new Set(selectedOptions);

		// Update local vote counts optimistically with Svelte reactivity
		const currentUserPubkey = $key.pub;
		const newVotes = new Map(votes);

		// Remove user from all existing options first (NIP-1068: last vote wins)
		newVotes.forEach((voters, optionId) => {
			if (voters.has(currentUserPubkey)) {
				newVotes.set(optionId, new Set([...voters].filter((p) => p !== currentUserPubkey)));
			}
		});

		// Add user to selected options
		selectedOptions.forEach((optionId) => {
			const existingVoters = newVotes.get(optionId) || new Set();
			newVotes.set(optionId, new Set([...existingVoters, currentUserPubkey]));
		});

		votes = newVotes;
		recalculateTotals();

		// Build kind 1018 vote event
		const voteEvent = {
			kind: 1018,
			content: '', // Kind 1018 typically has empty content
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['e', noteId], // Reference to poll event
				['p', note.pubkey()!], // Reference to poll author
				...Array.from(selectedOptions).map((optionId) => ['response', optionId])
			]
		};

		let sendStatus: { [url: string]: ConnectionStatus } = {};

		usePublish(
			'vote_' + noteId,
			voteEvent,
			(message) => {
				const status = asConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl();
					if (relayUrl) {
						sendStatus[normalizeURL(relayUrl)] = status;
						updateSendStatus('vote_' + noteId, sendStatus);
					}
				}
			},
			{ defaultRelays: relayUrls.length > 0 ? relayUrls : undefined, trackStatus: true }
		);
	}

	// Check if current user has already voted (on mount/data load)
	function checkUserVoted() {
		if (!$key?.pub) return;
		const currentUserPubkey = $key.pub;
		let found = false;
		let votedOptions = new Set<string>();

		votes.forEach((voters, optionId) => {
			if (voters.has(currentUserPubkey)) {
				found = true;
				votedOptions.add(optionId);
			}
		});

		hasVoted = found;
		userVotedOptions = votedOptions;
	}

	// Subscribe to votes when visible
	function subscribe() {
		if (!visible || !note?.id()) return;

		// Get relay URLs from poll data or use defaults
		const pollRelays = pollData ? fbArray(pollData, 'relayUrls').map((r) => toString(r)) : [];
		relayUrls = pollRelays.length > 0 ? pollRelays : [];

		const noteId = note.id();
		if (!noteId) return;

		// Subscribe to kind 1018 events referencing this poll
		sub = useSubscription(
			'poll_votes_' + noteId,
			[
				{
					kinds: [1018],
					tags: { '#e': [noteId] },
					limit: 500,
					relays: relayUrls,
					cacheFirst: true
				}
			],
			handleVoteEvents
		);
	}

	function unsubscribe() {
		// console.log('unsubscribe');
		sub?.();
		sub = undefined;
	}

	// Reactive updates
	$: pollData = extractPollData(note);
	$: pollEnded = pollData ? checkPollEnd(pollData.endsAt()) : false;
	// $: visible ? subscribe() : unsubscribe();

	// Get options array from poll data
	$: options = pollData ? fbArray(pollData, 'options') : [];

	// Get content blocks for additional poll context
	$: contentBlocks = pollData ? fbArray(pollData, 'contentBlocks') : [];
	$: endsAtFormatted = (() => {
		const endsAt = pollData?.endsAt();
		if (!endsAt || endsAt === BigInt(0)) return null;
		const date = new Date(Number(endsAt) * 1000);
		return date.toLocaleString();
	})();

	// Get nevent for sharing
	$: nevent = note?.id() ? nip19.neventEncode({ id: note.id()!, relays: relayUrls }) : '';

	// Reactive: check if user has voted when votes or key changes
	$: if ($key?.pub && votes.size > 0) checkUserVoted();

	onMount(subscribe);

	onDestroy(unsubscribe);
</script>

{#if pollData}
	<div
		class="mt-2 rounded-lg overflow-hidden border border-primary-content/20 bg-base-200/50"
		on:click|stopPropagation
	>
		<!-- Poll Header -->
		<div class="p-4">
			<div class="flex items-center gap-2 mb-3">
				<Icon icon="mdi:poll" class="text-xl text-primary" />
				<span class="text-sm font-medium text-base-content/70">Poll</span>
				{#if pollData.pollType() === PollType.SingleChoice}
					<span class="text-xs bg-base-300 px-2 py-0.5 rounded-full">Single choice</span>
				{:else}
					<span class="text-xs bg-base-300 px-2 py-0.5 rounded-full">Multiple choice</span>
				{/if}
				{#if pollEnded}
					<span class="text-xs bg-error/20 text-error px-2 py-0.5 rounded-full">Ended</span>
				{:else if endsAtFormatted}
					<span class="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full"
						>Ends {endsAtFormatted}</span
					>
				{/if}
			</div>

			<!-- Question (rendered from contentBlocks for rich text support) -->
			{#if contentBlocks.length > 0}
				<div class="text-lg font-semibold mb-2">
					<ContentBlocks
						content={contentBlocks}
						context={[]}
						{visible}
						showMedia={false}
						showQuote={false}
					/>
				</div>
			{/if}
		</div>

		<!-- Options -->
		<div class="px-4 pb-4 space-y-2">
			{#each options as option}
				{@const optionId = toString(option.id())}
				{@const label = toString(option.label())}
				{@const stats = voteStatsMap.get(optionId) || { count: 0, percentage: 0 }}
				{@const isSelected = selectedOptions.has(optionId)}
				<div
					class="relative cursor-pointer transition-all"
					class:opacity-50={pollEnded}
					on:click|stopPropagation={() => toggleOption(optionId)}
					on:keydown={(e) => e.key === 'Enter' && toggleOption(optionId)}
					role="button"
					tabindex="0"
				>
					<div
						class="flex items-center justify-between p-3 rounded-lg border-2 transition-all {isSelected
							? 'border-primary bg-primary/10'
							: 'border-base-300 hover:border-primary/50'}"
					>
						<div class="flex items-center gap-3 flex-1">
							<!-- Selection indicator -->
							<div
								class="w-5 h-5 rounded-full border-2 flex items-center justify-center {isSelected
									? 'border-primary bg-primary'
									: 'border-base-content/30'}"
							>
								{#if isSelected}
									<Icon icon="mdi:check" class="text-white text-xs" />
								{/if}
							</div>

							<!-- Label -->
							<span class="font-medium">{label || optionId}</span>
						</div>

							<!-- Vote stats -->
							<div class="flex items-center gap-2 text-sm text-base-content/60">
								<span>{stats.count} votes</span>
								<span>({stats.percentage}%)</span>
							</div>
					</div>

					<!-- Progress bar -->
					{#if totalVotes > 0}
						<div class="mt-1 h-1.5 bg-base-300 rounded-full overflow-hidden">
							<div
								class="h-full bg-primary rounded-full transition-all duration-300"
								style="width: {stats.percentage}%"
							/>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Footer -->
		<div class="px-4 py-3 border-t border-base-300 flex items-center justify-between">
			<div class="text-sm text-base-content/60">
				{totalVotes} total vote{totalVotes === 1 ? '' : 's'}
			</div>

			<div class="flex items-center gap-2">
				{#if !pollEnded && !hasVoted && selectedOptions.size > 0}
					<button
						class="btn btn-primary btn-sm"
						on:click|stopPropagation={castVote}
						disabled={isVoting}
					>
						{#if isVoting}
							<Loader size="sm" className="mr-1" />
						{/if}
						{isVoting ? 'Voting...' : 'Vote'}
					</button>
				{:else if hasVoted}
					<span class="text-sm text-success flex items-center gap-1">
						<Icon icon="mdi:check-circle" />
						Voted
					</span>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="p-3 rounded-lg bg-info-content/30 text-sm flex items-center gap-2 mt-2">
		<Icon icon="mdi:poll" />
		<span>Poll (kind 1068) - parsed data not available</span>
	</div>
{/if}
