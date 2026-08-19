<script lang="ts">
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
	import { onDestroy, onMount } from 'svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key } from 'src/controller';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { go } from 'src/routes/modals/modal';

	export let note: ParsedEvent;
	export let pollData: Kind1068Parsed;
	export let visible: boolean = false;

	// Poll state
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
	function castVote() {
		if (!$key?.pub || $key.hasSigner === false) {
			go('login');
			return;
		}
		if (selectedOptions.size === 0 || isVoting) return;

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
	$: pollEnded = checkPollEnd(pollData.endsAt());
	// $: visible ? subscribe() : unsubscribe();

	// Get options array from poll data
	$: options = fbArray(pollData, 'options');
	$: endsAtFormatted = (() => {
		const endsAt = pollData.endsAt();
		if (!endsAt || endsAt === BigInt(0)) return null;
		const date = new Date(Number(endsAt) * 1000);
		return date.toLocaleString();
	})();

	// Reactive: check if user has voted when votes or key changes
	$: if ($key?.pub && votes.size > 0) checkUserVoted();

	onMount(subscribe);

	onDestroy(unsubscribe);
</script>

<div class="mt-3 space-y-2">
	<div class="space-y-2">
		{#each options as option (toString(option.id()))}
			{@const optionId = toString(option.id())}
			{@const label = toString(option.label())}
			{@const stats = voteStatsMap.get(optionId) || { count: 0, percentage: 0 }}
			{@const isSelected = selectedOptions.has(optionId)}
			<button
				type="button"
				class="relative min-h-11 w-full overflow-hidden rounded-lg border border-base-content/20 text-left transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:hover:border-base-content/20"
				class:border-primary={isSelected}
				class:ring-1={isSelected}
				class:ring-primary={isSelected}
				on:click|stopPropagation={() => toggleOption(optionId)}
				disabled={pollEnded || hasVoted || isVoting}
				aria-pressed={isSelected}
			>
				{#if totalVotes > 0}
					<span
						class="absolute inset-y-0 left-0 bg-primary/10 transition-[width] duration-300"
						style:width={`${stats.percentage}%`}
					></span>
				{/if}
				<span class="relative z-[1] flex items-center justify-between gap-3 px-3 py-2.5">
					<span class="flex min-w-0 items-center gap-2.5">
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center border-2 border-base-content/30"
							class:rounded-full={pollData.pollType() === PollType.SingleChoice}
							class:rounded={pollData.pollType() !== PollType.SingleChoice}
							class:border-primary={isSelected}
							class:bg-primary={isSelected}
						>
							{#if isSelected}
								<Icon icon="mdi:check" class="text-xs text-primary-content" />
							{/if}
						</span>
						<span class="break-words font-medium">{label || optionId}</span>
					</span>
					{#if totalVotes > 0}
						<span class="shrink-0 text-sm tabular-nums text-base-content/70"
							>{stats.percentage}%</span
						>
					{/if}
				</span>
			</button>
		{/each}
	</div>

	<div class="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
		<div class="flex flex-wrap items-center gap-x-1 text-sm text-base-content/60">
			<span>{totalVotes} vote{totalVotes === 1 ? '' : 's'}</span>
			<span aria-hidden="true">·</span>
			<span>{pollData.pollType() === PollType.SingleChoice ? 'Choose one' : 'Choose multiple'}</span
			>
			{#if pollEnded}
				<span aria-hidden="true">·</span>
				<span>Final results</span>
			{:else if endsAtFormatted}
				<span aria-hidden="true">·</span>
				<span>Ends {endsAtFormatted}</span>
			{/if}
		</div>

		<div class="flex min-h-8 items-center">
			{#if !pollEnded && !hasVoted}
				<button
					type="button"
					class="btn btn-primary btn-sm min-h-8 h-8"
					on:click|stopPropagation={castVote}
					disabled={Boolean($key?.pub && $key.hasSigner !== false) &&
						(selectedOptions.size === 0 || isVoting)}
				>
					{#if isVoting}
						<Loader size="sm" className="mr-1" />
					{/if}
					{!$key?.pub || $key.hasSigner === false
						? 'Sign in to vote'
						: isVoting
							? 'Voting...'
							: 'Vote'}
				</button>
			{:else if hasVoted}
				<span class="flex items-center gap-1 text-sm text-success">
					<Icon icon="mdi:check-circle" />
					Voted
				</span>
			{/if}
		</div>
	</div>
</div>
