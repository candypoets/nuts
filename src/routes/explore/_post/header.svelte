<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Kind0Parsed, ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind0, isKind0 } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { format } from 'date-fns';
	import { getContext, onMount } from 'svelte';

	import { isMobile } from 'src/controller';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import {
		clearNavigationRoot,
		currentNavigationPathname,
		navigateStackPath
	} from 'src/routes/modals/modal';
	import { userQuery } from 'src/routes/queries/user';

	export let note: ParsedEvent;
	export let context: ParsedEvent[] = [];
	export let depth = 0;
	export let main = false;

	export let oneline: boolean = true;

	let author: Kind0Parsed | undefined;
	let isImageContext = getContext('imageContext');
	let sub: (() => void) | undefined;

	$: notePubkey = note.pubkey()!;

	$: decoded = {
		name:
			(typeof author?.name === 'function' ? author.name() : author?.name) ||
			(typeof author?.displayName === 'function'
				? author.displayName()
				: author?.displayName),
		picture: author?.picture?.(),
		nip05: author?.nip05?.()
	};

	onMount(() => {
		if (!author) {
			const authorEvent = context.find(
				(c) => c.pubkey()! === notePubkey && c.kind() == 0
			);

			if (!authorEvent) {
				sub = useSubscription(
					'u_' + notePubkey,
					userQuery(notePubkey),
					(message: WorkerMessage) => {
						const kind0 = isKind0(message);

						if (kind0) {
							author = kind0 as Kind0Parsed;
							sub?.();
						}
					},
					{}
				);
			} else {
				author = asKind0(authorEvent) as Kind0Parsed;
			}
		}
		return () => sub?.();
	});

	function formatTimeShort(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp * 1000;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'now';
		if (minutes < 60) return `${minutes}m`;
		if (hours < 24) return `${hours}h`;
		if (days < 30) return `${days}d`;
		return format(timestamp * 1000, 'yyyy/MM/dd');
	}

	function go() {
		if (isImageContext) return;
		const currentPath = currentNavigationPathname();
		clearNavigationRoot();
		const profilePath = `nprofile:${note.pubkey()!}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(profilePath)) {
			navigateStackPath(resolve(`${currentPath}/${profilePath}` as '/home'));
		}
	}
</script>

<div class="flex gap-2 relative" class:!gap-1={!!depth}>
	<div class="w-8 min-w-8" class:!w-4={!!depth} class:!min-w-4={!!depth}>
		<a on:click|stopPropagation|preventDefault={go} class="cursor-pointer">
			<img
				src={decoded?.picture ? proxyAvatarUrl(decoded.picture) : '/miss-profile.png'}
				alt={decoded?.name}
				class="border w-8 h-8 rounded-full space-x-4 mx-auto z-10 object-cover"
				class:!w-4={!!depth}
				class:!h-4={!!depth}
			/>
		</a>
	</div>
	<div class="w-full">
		<div class="flex justify-between">
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
							<a
								on:click|stopPropagation|preventDefault={go}
								class="hover:underline cursor-pointer"
							>
								<div class="whitespace-nowrap overflow-hidden text-ellipsis">
									{decoded?.name && $isMobile && decoded.name.length > 25
										? decoded.name.slice(0, 25) + '...'
										: decoded?.name || notePubkey?.slice(0, 15) + '...'}
								</div>
							</a>
							<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
							<p class="text-xs opacity-50 ml-2">
								{formatTimeShort(note?.createdAt() || 0)}
							</p>
						</div>
						{#if decoded?.nip05}
							<p class="text-xs opacity-50">{decoded?.nip05}</p>
						{/if}
					</div>
				{/if}
				{#if oneline && note?.createdAt()}
					<p class="text-xs opacity-50 ml-2">
						{formatTimeShort(note?.createdAt() || 0)}
					</p>
				{/if}
			</div>
			<slot />
		</div>
	</div>
</div>
