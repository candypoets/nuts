<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';

	import { formatDate } from 'date-fns';
	import { DAY } from 'src/lib/period';
	import { isKind7376, type AnyKind, type Kind9321Parsed } from 'src/types';
	import type { Kind7376Parsed } from 'src/types/kind7376';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { key } from 'src/controller';
	import { useSubscription, type SubscribeKind } from 'src/model/nostr-main';
	import type { ParsedEvent } from 'src/types';

	export let zap: ParsedEvent<Kind9321Parsed>;
	export let context: ParsedEvent<AnyKind>[];

	let redeemed: ParsedEvent<Kind7376Parsed> | undefined;
	let sub: () => void;

	function go() {
		const currentPath = $page.url.pathname;
		let eventPath = '';
		if (zap?.parsed?.eventId) {
			eventPath = `nevent:${zap?.parsed?.eventId}`;
		} else {
			eventPath = `nprofile:${
				zap?.parsed?.recipient == $key?.pub ? zap?.pubkey : zap?.parsed?.recipient
			}`;
		}

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(eventPath)) {
			goto(`${currentPath}/${eventPath}`);
		}
	}

	// Helper function to prevent errors if values are null/undefined
	const getAmount = (event: ParsedEvent<any> | undefined): number => {
		return event?.parsed?.amount ?? 0;
	};

	onMount(() => {
		// Find existing redeem event in context
		redeemed = context.find((c) => isKind7376(c) && c.id === zap.id) as
			| ParsedEvent<Kind7376Parsed>
			| undefined; // Ensure correct type or undefined

		// If not found and we are the recipient, subscribe to find it
		if (!redeemed && zap.parsed?.recipient) {
			sub = useSubscription(
				'kind:7376:' + zap.id, // Subscription ID related to the zap
				[
					// Only subscribe if we are the recipient
					{
						kinds: [7376],
						authors: [zap.parsed?.recipient], // Author must be the recipient
						tags: { '#e': [zap.id] }, // Must reference the zap event
						limit: 1,
						cacheFirst: true,
						relays: zap.relays || [] // Use relays from original zap if possible
					}
				],
				(events: ParsedEvent<AnyKind>[], kind: SubscribeKind) => {
					if (kind == 'EOSE') {
						return;
					}
					// Removed unused 'type' and 'context' parameters
					const [event, ...context] = events;
					if (isKind7376(event)) {
						redeemed = event; // Assign the found redeem event
						console.log('tags: ', event.parsed?.tags);
						if (sub) sub(); // Unsubscribe once found
					}
				},
				{ closeOnEose: true }
			);
		}
		return () => sub?.();
	});
</script>

{#if zap.isFirst}
	<strong class="text-base mt-2 block">
		{#if zap.created_at > new Date().setHours(0, 0, 0, 0) / 1000}
			TODAY
		{:else if zap.created_at > new Date().setHours(0, 0, 0, 0) / 1000 - DAY}
			Yesterday
		{:else}
			{formatDate(new Date(zap.created_at * 1000), 'dd-MM-yyyy')}
		{/if}
	</strong>
{/if}
<!-- Added role, tabindex and keydown for accessibility -->
<div
	class="p-4 cursor-pointer border-x border-b"
	class:border-t={zap.isFirst}
	class:rounded-t-lg={zap.isFirst}
	on:click|stopPropagation={go}
	on:keydown={(e) => e.key === 'Enter' && go()}
	role="link"
	tabindex="0"
>
	<div class="flex items-center justify-between gap-2">
		{#if zap.pubkey === $key?.pub}
			<!-- User is the sender -->
			<div class="flex items-center gap-2 overflow-hidden">
				<Avatar pubkey={zap?.parsed?.recipient ?? ''} {context} size="lg" />
				<span class="font-medium truncate"
					>You zapped
					<User pubkey={zap?.parsed?.recipient ?? ''} {context} />
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
				<Avatar pubkey={zap?.pubkey ?? ''} {context} size="lg" />
				<span class="font-medium truncate">
					<span class="font-bold"><User pubkey={zap?.pubkey ?? ''} {context} /></span>
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
	{#if zap.content}
		<div class="mt-2 text-sm text-base-content/70 ml-12 break-words">
			"{zap.content}"
		</div>
	{/if}
</div>
