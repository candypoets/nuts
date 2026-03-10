<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { WorkerMessage, type ParsedEvent } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind9735, fbArray, isKind10002 } from '@candypoets/nipworker/utils';
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
	export let isFirst: boolean = false;
	export let isLast: boolean = false;

	let kind9735 = asKind9735(zap);

	let decoded = {
		id: zap?.id(),
		kind: zap?.kind(),
		pubkey: zap?.pubkey(),
		createdAt: zap?.createdAt(),
		content: kind9735?.content(),
		sender: kind9735?.sender(),
		recipient: kind9735?.recipient(),
		amount: kind9735?.amount() || 0,
		bolt11: kind9735?.bolt11(),
		preimage: kind9735?.preimage(),
		eventId: kind9735?.event()
	};

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
						.map((r) => r?.url()) || [];
				usub?.();
			}
		}
	);

	function go() {
		const currentPath = $page.url.pathname;
		let eventPath = '';
		if (decoded.eventId) {
			eventPath = `nevent:${nip19.neventEncode({ id: decoded?.eventId, relays })}`;
		} else {
			eventPath = `nprofile:${decoded.recipient == $key?.pub ? decoded.sender : decoded.recipient}`;
		}

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(eventPath)) {
			goto(`${currentPath}/${eventPath}`);
		}
	}

	onMount(() => {
		return () => {
			usub?.();
		};
	});
</script>

<!-- <div class="break-words">{JSON.stringify(decoded)}</div> -->
<!-- Added role, tabindex and keydown for accessibility -->
<div
	class="p-4 cursor-pointer border-x border-b border-primary-content bg-base-300 bg-opacity-85 relative"
	class:rounded-t-lg={isFirst}
	class:rounded-b-lg={isLast}
	class:border-t={isFirst}
	class:mt-1={isFirst}
	on:click|stopPropagation={go}
	on:keydown={(e) => e.key === 'Enter' && go()}
	role="link"
	tabindex="0"
>
	{#if isFirst}
		<div class="flex justify-center">
			<strong class="absolute px-2 text-xs top-0 text-base-content/70 mt-1">
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
	<div class="flex items-center justify-between gap-2">
		{#if decoded.sender === $key?.pub}
			<!-- User is the sender -->
			<div class="flex items-center gap-2 overflow-hidden">
				<div class="relative">
					<Avatar pubkey={decoded?.recipient ?? ''} {context} size="lg" />
					<div
						class="absolute bottom-0 right-0 w-5 h-5 translate-x-1/4 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-base-300"
					>
						<Icon icon="ph:lightning-fill" class="text-xs text-white" />
					</div>
				</div>
				<span class="font-medium truncate"
					>You zapped
					<User pubkey={decoded?.recipient ?? ''} {context} />
				</span>
			</div>
			<span class="flex items-center gap-1 text-primary font-bold shrink-0">
				<Icon icon="ph:check-circle" class="text-success" />
				<span>{decoded.amount} sats</span>
			</span>
		{:else if decoded.recipient === $key?.pub}
			<!-- User is the recipient -->
			<div class="flex items-center gap-2 overflow-hidden">
				<div class="relative">
					<Avatar pubkey={decoded?.sender ?? ''} {context} size="lg" />
					<div
						class="absolute bottom-0 right-0 w-5 h-5 translate-x-1/4 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-base-300"
					>
						<Icon icon="ph:lightning-fill" class="text-xs text-white" />
					</div>
				</div>
				<span class="font-medium truncate">
					<span class="font-bold"><User pubkey={decoded?.sender ?? ''} {context} /></span>
					<span class="font-bold">zapped you</span>
				</span>
			</div>

			<span class="flex items-center gap-1 text-primary font-bold shrink-0">
				<Icon icon="ph:check-circle" class="text-success" />
				<span>{decoded.amount} sats</span>
			</span>
		{/if}
	</div>
	{#if decoded.content}
		<div class="mt-2 text-sm text-base-content/70 ml-12 break-words">
			"{decoded.content}"
		</div>
	{/if}
</div>
