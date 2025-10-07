<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Kind9321Parsed, WorkerMessage, type ParsedEvent } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind7376,
		asKind9321,
		asParsedEvent,
		fbArray,
		isKind10002
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { formatDate } from 'date-fns';
	import { nip19 } from 'nostr-tools';
	import { onMount } from 'svelte';

	import { key } from 'src/controller';
	import { DAY } from 'src/lib/period';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { userQuery } from 'src/routes/queries/user';

	export let zap: ParsedEvent;
	export let context: ParsedEvent[];

	let kind9321 = asKind9321(zap);

	let decoded = {
		id: zap?.id()?.toString(),
		kind: zap?.kind(),
		pubkey: zap?.pubkey()?.toString(),
		createdAt: zap?.createdAt(),
		comment: kind9321?.comment()?.toString(),
		sender: zap?.pubkey()?.toString(),
		eventId: kind9321?.eventId()?.toString(),
		recipient: kind9321?.recipient()?.toString()
	};

	console.log('proofs', fbArray(kind9321 as Kind9321Parsed, 'proofs'));

	let redeemed: ParsedEvent | undefined;
	let sub: (() => void) | undefined;

	let relays: string[] = [];

	let usub = useSubscription(
		'u_' + decoded.recipient || '',
		userQuery(decoded.recipient || ''),
		(message: WorkerMessage) => {
			const kind10002 = isKind10002(message);
			if (kind10002) {
				relays =
					fbArray(kind10002, 'relays')
						.filter((r) => r.write())
						.map((r) => r?.url()?.toString()) || [];
				usub?.();
			}
		}
	);

	function go() {
		const currentPath = $page.url.pathname;
		let eventPath = '';
		if (kind9321?.eventId()) {
			eventPath = `nevent:${nip19.neventEncode({ id: decoded?.eventId, relays })}`;
		} else {
			eventPath = `nprofile:${decoded.recipient == $key?.pub ? decoded.sender : decoded.recipient}`;
		}

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(eventPath)) {
			goto(`${currentPath}/${eventPath}`);
		}
	}

	// Helper function to prevent errors if values are null/undefined
	const getAmount = (event: ParsedEvent | undefined): number => {
		return kind9321?.amount() ?? 0;
	};

	onMount(() => {
		// Find existing redeem event in context
		redeemed = context.find((c) => asKind7376(c) && c.id === zap.id) as ParsedEvent | undefined; // Ensure correct type or undefined

		// If not found and we are the decoded.recipient, subscribe to find it
		if (!redeemed && decoded.recipient) {
			sub = useSubscription(
				'kind:7376:' + zap.id()?.fnv1aHash(), // Subscription ID related to the zap
				[
					// Only subscribe if we are the decoded.recipient
					{
						kinds: [7376],
						authors: [decoded.recipient], // Author must be the recipient
						tags: { '#e': [decoded?.id || ''] }, // Must reference the zap event
						limit: 1,
						cacheFirst: true,
						relays: fbArray(zap, 'relays').map((r) => r.toString()) || [] // Use relays from original zap if possible
					}
				],
				(message: WorkerMessage) => {
					const parsedEvent = asParsedEvent(message);
					if (parsedEvent) {
						const kind7376 = asKind7376(parsedEvent);
						if (kind7376) {
							// Ensure it's a valid redeem event
							redeemed = parsedEvent;
							sub?.(); // Unsubscribe once found
						}
					}
				},
				{ closeOnEose: true }
			);
		}
		return () => {
			sub?.();
			usub?.();
		};
	});
</script>

{#if zap.isFirst}
	<div class="flex justify-center">
		<strong class="bg-base-300 bg-opacity-85 backdrop-blur-gpu px-2 text-xs">
			{#if decoded.createdAt > new Date().setHours(0, 0, 0, 0) / 1000}
				TODAY
			{:else if decoded.createdAt > new Date().setHours(0, 0, 0, 0) / 1000 - DAY}
				Yesterday
			{:else}
				{formatDate(new Date(decoded.createdAt * 1000), 'dd-MM-yyyy')}
			{/if}
		</strong>
	</div>
{/if}
<!-- <div class="break-words">{JSON.stringify(decoded)}</div> -->
<!-- Added role, tabindex and keydown for accessibility -->
<div
	class="p-4 cursor-pointer border-x border-b border-primary-content bg-base-300 bg-opacity-85 backdrop-blur-gpu"
	class:rounded-t-lg={zap.isFirst}
	on:click|stopPropagation={go}
	on:keydown={(e) => e.key === 'Enter' && go()}
	role="link"
	tabindex="0"
>
	<div class="flex items-center justify-between gap-2">
		{#if decoded.pubkey === $key?.pub && decoded.recipient}
			<!-- User is the sender -->
			<div class="flex items-center gap-2 overflow-hidden">
				<Avatar pubkey={decoded?.recipient ?? ''} {context} size="lg" />
				<span class="font-medium truncate"
					>You zapped
					<User pubkey={decoded?.recipient ?? ''} {context} />
				</span>
			</div>
			<span class="flex items-center gap-1 text-primary font-bold shrink-0">
				{#if redeemed}
					{@const redeemedAmount = getAmount(redeemed)}
					{@const zapAmount = getAmount(zap)}
					{#if redeemedAmount >= zapAmount}
						<!-- Fully Redeemed -->
						<Icon icon="ph:check-circle" class="text-success" />
						<span>{zapAmount} sats</span>
					{:else if redeemedAmount > 0}
						<!-- Partially Redeemed -->
						<Icon icon="ph:warning-circle" class="text-warning" />
						<span class="text-warning">{redeemedAmount}/{zapAmount} sats</span>
					{:else}
						<!-- Redeemed event exists but amount is 0 or invalid? Show pending or error? Let's show pending for now -->
						<Icon icon="ph:hourglass" />
						<span>{zapAmount} sats</span>
					{/if}
				{:else}
					<!-- Pending Redemption (No redeem event found yet) -->
					<Icon icon="ph:hourglass" class="text-gray-500" />
					<span class="text-gray-500">{getAmount(zap)} sats</span>
				{/if}
			</span>
		{:else}
			<!-- User is the recipient -->
			<div class="flex items-center gap-2 overflow-hidden">
				<Avatar pubkey={decoded?.pubkey ?? ''} {context} size="lg" />
				<span class="font-medium truncate">
					<span class="font-bold"><User pubkey={decoded?.pubkey ?? ''} {context} /></span>
					<span class="font-bold">zapped you</span>
				</span>
			</div>

			<!-- <Icon icon="ph:arrow-right" /> -->
			<span class="flex items-center gap-1 text-primary font-bold shrink-0">
				{#if redeemed}
					{@const redeemedAmount = getAmount(redeemed)}
					{@const zapAmount = getAmount(zap)}
					{#if redeemedAmount >= zapAmount}
						<!-- Fully Redeemed -->
						<Icon icon="ph:check-circle" class="text-success" />
						<span>{zapAmount} sats</span>
					{:else if redeemedAmount > 0}
						<!-- Partially Redeemed -->
						<Icon icon="ph:warning-circle" class="text-warning" />
						<span class="text-warning">{redeemedAmount}/{zapAmount} sats</span>
					{:else}
						<!-- Redeemed event exists but amount is 0 or invalid? Show pending for now -->
						<Icon icon="ph:hourglass" />
						<span>{zapAmount} sats</span>
					{/if}
				{:else}
					<!-- Pending Redemption (No redeem event found yet) -->
					<Icon icon="ph:hourglass" />
					<span>{getAmount(zap)} sats</span>
				{/if}
			</span>
		{/if}
	</div>
	{#if decoded.comment}
		<div class="mt-2 text-sm text-base-content/70 ml-12 break-words">
			"{decoded.comment}"
		</div>
	{/if}
</div>
