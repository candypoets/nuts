<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { Kind0Parsed, ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isKind0, isParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { getContext, onMount } from 'svelte';

	import { isMobile } from 'src/controller';
	import { profileManager } from 'src/controller/managers';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { userQuery } from 'src/routes/queries/user';

	export let note: ParsedEvent;
	export let context: ParsedEvent[] = [];
	export let depth = 0;
	export let main = false;

	export let oneline: boolean = true;

	let author: Kind0Parsed | undefined;
	let isImageContext = getContext('imageContext');
	let sub: (() => void) | undefined;

	$: notePubkey = note.pubkey()!.toString();

	$: decoded = {
		name:
			(typeof author?.name === 'function' ? author.name()?.toString() : author?.name?.toString()) ||
			(typeof author?.displayName === 'function'
				? author.displayName()?.toString()
				: author?.displayName?.toString()),
		picture: author?.picture?.()?.toString(),
		nip05: author?.nip05?.()?.toString()
	};

	onMount(() => {
		if (!author) {
			author = context.find((c) => c.pubkey()!.toString() === notePubkey && c.kind() == 0)
				?.parsed as Kind0Parsed | undefined;
			if (!author) {
				sub = useSubscription(
					'u_' + note.pubkey(),
					userQuery(notePubkey),
					(message: WorkerMessage) => {
						const kind0 = isKind0(message);

						if (kind0) {
							author = kind0 as Kind0Parsed;
							sub?.();
						}
					},
					{},
					profileManager
				);
			}
		}
		return () => sub?.();
	});

	function go() {
		if (isImageContext) return;
		const currentPath = $page.url.pathname;
		const profilePath = `nprofile:${note.pubkey()!.toString()}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(profilePath)) {
			goto(`${currentPath}/${profilePath}`);
		}
	}
</script>

<div class="flex gap-2 relative" class:!gap-1={!!depth}>
	<div class="w-8 min-w-8" class:!w-6={!!depth} class:!min-w-6={!!depth}>
		<a on:click|stopPropagation|preventDefault={go} class="cursor-pointer">
			<img
				src={decoded?.picture ? proxyAvatarUrl(decoded.picture) : '/ns-naked.svg'}
				alt={decoded?.name}
				class="border w-8 h-8 rounded-full space-x-4 mx-auto z-10 object-cover"
				class:!w-6={!!depth}
				class:!h-6={!!depth}
			/>
		</a>
	</div>
	<div class="w-full">
		<div class="flex items-start" class:flex-wrap={isImageContext} class:items-center={oneline}>
			{#if oneline}
				<a on:click|stopPropagation|preventDefault={go} class="hover:underline cursor-pointer">
					<div
						class="whitespace-nowrap overflow-hidden text-ellipsis font-semibold text-sm"
						class:!text-base={main}
					>
						{decoded?.name && $isMobile && decoded.name.length > 25
							? decoded.name.slice(0, 25) + '...'
							: decoded?.name || notePubkey?.slice(0, 15) + '...'}
					</div>
				</a>
				{#if decoded?.nip05}
					<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
					<p class="text-xs opacity-50 lg:inline hidden">{decoded?.nip05}</p>
				{/if}
			{:else}
				<div class="flex-grow">
					<div class="flex items-center">
						<a on:click|stopPropagation|preventDefault={go} class="hover:underline cursor-pointer">
							<div class="whitespace-nowrap overflow-hidden text-ellipsis">
								{decoded?.name && $isMobile && decoded.name.length > 25
									? decoded.name.slice(0, 25) + '...'
									: decoded?.name || notePubkey?.slice(0, 15) + '...'}
							</div>
						</a>
						<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
						<p class="text-xs opacity-50 ml-2">
							{formatDistanceToNow((note?.createdAt() || 0) * 1000, { addSuffix: true })}
						</p>
					</div>
					{#if decoded?.nip05}
						<p class="text-xs opacity-50">{decoded?.nip05}</p>
					{/if}
				</div>
			{/if}
			{#if oneline && note?.createdAt()}
				<p class="text-xs opacity-50 ml-2">
					{formatDistanceToNow((note?.createdAt() || 0) * 1000, { addSuffix: true })}
				</p>
			{/if}
			<slot />
		</div>
	</div>
</div>
