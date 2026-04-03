<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { asKind1311, fbArray, asKind0, isKind0 } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { format } from 'date-fns';
	import { onMount } from 'svelte';
	import type { WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';

	import { userQuery } from 'src/routes/queries/user';
	import ContentBlocks from './ContentBlocks.svelte';

	export let note: ParsedEvent;
	export let context: ParsedEvent[] = [];

	// Get the kind 1311 parsed data
	$: parsed = asKind1311(note);
	$: pubkey = note.pubkey()!;

	let author: ReturnType<typeof asKind0> | undefined;
	let sub: (() => void) | undefined;

	// Fetch author profile
	onMount(() => {
		if (!author) {
			const authorEvent = context.find((c) => c.pubkey()! === pubkey && c.kind() == 0);
			if (!authorEvent) {
				sub = useSubscription(
					'u_' + pubkey,
					userQuery(pubkey),
					(message: WorkerMessage) => {
						const kind0 = isKind0(message);
						if (kind0 && kind0.pubkey()! === pubkey) {
							author = kind0;
							sub?.();
						}
					},
					{}
				);
			} else {
				author = asKind0(authorEvent);
			}
		}
		return () => sub?.();
	});

	// Format time ago
	function formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp * 1000;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'now';
		if (minutes < 60) return `${minutes}m`;
		if (hours < 24) return `${hours}h`;
		if (days < 30) return `${days}d`;
		return format(timestamp * 1000, 'MMM d');
	}
</script>

<div class="flex gap-2 py-2 px-1 hover:bg-white/5 transition-colors">
	<!-- Avatar -->
	<div class="w-8 min-w-8">
		<img
			src={author?.picture?.() || '/miss-profile.png'}
			alt={author?.name?.() || pubkey.slice(0, 8)}
			class="w-8 h-8 rounded-full object-cover"
		/>
	</div>

	<!-- Content -->
	<div class="flex-1 min-w-0">
		<!-- Header: Name + Time -->
		<div class="flex items-center gap-2 mb-0.5">
			<span class="font-semibold text-sm text-highlight truncate">
				{author?.name?.() || author?.displayName?.() || pubkey.slice(0, 8) + '...'}
			</span>
			{#if author?.nip05?.()}
				<Icon icon="bitcoin-icons:verify-filled" class="text-base text-primary flex-shrink-0" />
			{/if}
			<span class="text-xs flex-shrink-0">
				{formatTimeAgo(note.createdAt() || 0)}
			</span>
		</div>

		<!-- Message Content -->
		<div class="text-sm">
			{#if parsed}
				{@const contentBlocks = fbArray(parsed, 'parsedContent')}
				{#if contentBlocks.length > 0}
					<ContentBlocks content={contentBlocks} {note} {context} showFull={true} />
				{:else}
					<!-- Fallback to raw content if parsed blocks aren't available -->
					<span class="break-words">{parsed.content()}</span>
				{/if}
			{/if}
		</div>
	</div>
</div>
