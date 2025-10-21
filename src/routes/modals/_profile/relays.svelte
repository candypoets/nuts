<script lang="ts">
	import type { ConnectionStatus, WorkerMessage } from '@candypoets/nipworker';
	import { usePublish } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import type { EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import VirtualList from 'src/components/VirtualList.svelte';
	import { isMobile, readRelays, writeRelays } from 'src/controller';
	import { relayInfos, relayStatusMap } from 'src/controller/relay';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { now } from 'src/lib/period';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { areStringListEqual } from 'src/lib/utils';
	import { getContext } from 'svelte';

	let animator = getContext('animator');
	let newRelayUrl = '';
	let loading = false;
	let isInvalid = false;
	let mode = 'read';
	let search = '';

	$: relaysSelected =
		mode === 'read' ? $readRelays?.map(normalizeURL) || [] : $writeRelays?.map(normalizeURL) || [];

	$: relaysToFilter =
		mode === 'read' ? $readRelays?.map(normalizeURL) || [] : $writeRelays?.map(normalizeURL) || [];

	type RelayItem = {
		url: string;
		status: string;
		info?: any;
	};

	async function addRelay() {
		loading = true;
		// const isValid = await checkNostrRelay(newRelayUrl);
		// loading = false;
		// isInvalid = !isValid;
		// if (isValid) {
		// 	db.relays.put({ url: newRelayUrl, enabled: true });
		// 	pool.addRelay(newRelayUrl);
		// 	newRelayUrl = '';
		// }
	}

	const getItemId = (r: RelayItem) => r.url;

	function toggleSelected(url: string) {
		if (relaysSelected.includes(url)) {
			relaysSelected = relaysSelected.filter((u) => u !== url);
		} else {
			relaysSelected = [...relaysSelected, url];
		}
	}

	// Derive the relays array from the stores
	$: relays = Array.from($relayStatusMap.entries()).map(([url, status]) => {
		const key = normalizeURL(url);
		const info = $relayInfos.get(key);
		return { url: key, status, info } as RelayItem;
	});

	// Filter based on search
	$: filteredRelays =
		mode &&
		relays
			.filter((r) => {
				const name = r.info?.name ?? '';
				const desc = r.info?.description ?? '';
				const url = r.url ?? '';
				return (
					!search ||
					name.toLowerCase().includes(search.toLowerCase()) ||
					desc.toLowerCase().includes(search.toLowerCase()) ||
					url.toLowerCase().includes(search.toLowerCase())
				);
			})
			.sort((a, b) => {
				// if (sorted) return 0;
				// sorted = true;
				const aSelected = relaysToFilter?.includes(a.url) ? 1 : 0;
				const bSelected = relaysToFilter?.includes(b.url) ? 1 : 0;
				return bSelected - aSelected;
			});

	function buildRelayListTags(readUrls: string[], writeUrls: string[]): string[][] {
		const readSet = new Set(readUrls.map((u) => normalizeURL(u)));
		const writeSet = new Set(writeUrls.map((u) => normalizeURL(u)));

		const allUrls = Array.from(new Set<string>([...readSet, ...writeSet])).sort();

		const tags: string[][] = [];
		for (const url of allUrls) {
			const inRead = readSet.has(url);
			const inWrite = writeSet.has(url);
			if (inRead && inWrite) {
				tags.push(['r', url]); // both read and write
			} else if (inRead) {
				tags.push(['r', url, 'read']); // read-only
			} else if (inWrite) {
				tags.push(['r', url, 'write']); // write-only
			}
		}
		return tags;
	}

	function saveRelays() {
		// Current lists from stores
		const currentRead = ($readRelays ?? []).map((u) => normalizeURL(u));
		const currentWrite = ($writeRelays ?? []).map((u) => normalizeURL(u));

		// Apply the user’s current selection to the appropriate set
		const selected = Array.from(new Set(relaysSelected.map((u) => normalizeURL(u))));
		const nextRead = mode === 'read' ? selected : currentRead;
		const nextWrite = mode === 'write' ? selected : currentWrite;

		const tags = buildRelayListTags(nextRead, nextWrite);

		const event: EventTemplate = {
			kind: 10002,
			created_at: now(),
			content: '', // NIP-65 specifies empty string
			tags
		};

		let sendStatus: { [url: string]: ConnectionStatus } = {};
		const id = mode + 'relays';

		// Publish with your existing hook (adjust invocation if your hook expects args)
		usePublish(id, event, (message: WorkerMessage) => {
			const status = isConnectionStatus(message);
			if (status) {
				const relayUrl = status.relayUrl()?.toString();
				sendStatus[relayUrl] = status;
				updateSendStatus(id, sendStatus);
			}
		});
	}
</script>

<div class="h-screen bg-base-300 bg-opacity-85">
	<div class="flex justify-between items-center px-4 pt-safe h-20">
		<div class="w-1/4" on:click={animator.goBack}>
			<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
		</div>
		<div class="dropdown">
			<label tabindex="0" class="font-bold text-xl flex items-center">
				{mode === 'read' ? 'Read Relays' : 'Write Relays'}
				<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
			</label>
			<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
				<li><a on:click={() => (mode = 'read')}>Read Relays</a></li>
				<li><a on:click={() => (mode = 'write')}>Write Relays</a></li>
			</ul>
		</div>
		<button
			class="btn w-1/4 btn-accent btn-outline"
			on:click={saveRelays}
			disabled={areStringListEqual(relaysSelected, relaysToFilter)}>save</button
		>
	</div>
	<div class="space-y-4 px-4">
		<!-- Search -->
		<div class="p-4 shrink-0">
			<div class="join bg-base-200 rounded-md w-full">
				<div class="join-item p-2">
					<Icon icon="carbon:search" />
				</div>
				<input
					placeholder="Search relays"
					bind:value={search}
					class="join-item flex-grow px-2 outline-none bg-transparent"
				/>
			</div>
		</div>
		<div class="join w-full px-4">
			<input
				class="w-full join-item px-2"
				class:input-error={isInvalid}
				type="text"
				bind:value={newRelayUrl}
				placeholder="Enter new relay URL"
			/>
			{#if loading}
				<button class="btn join-item"><span class="loading loading-dots"></span></button>
			{:else}
				<button class="btn join-item" on:click={() => addRelay()}>Add</button>
			{/if}
		</div>
		<div class="px-4 pb-safe flex-1 min-h-0">
			{#if filteredRelays.length > 0}
				<VirtualList
					items={filteredRelays}
					{getItemId}
					itemsPerRow={$isMobile ? 2 : 3}
					height="100%"
					className="w-full"
					let:item
					let:items
				>
					<div
						class="grid gap-4 mb-4"
						style="grid-template-columns: repeat({$isMobile ? 2 : 3}, minmax(0, 1fr));"
					>
						{#each items as r (r.url)}
							<div
								class="bg-base-200 rounded-xl relative cursor-pointer"
								on:click|stopPropagation={(_) => toggleSelected(r.url)}
								class:border={relaysSelected?.includes(r.url)}
								class:border-accent={relaysSelected?.includes(r.url)}
							>
								<div class="card-body p-4">
									<div class="flex items-center gap-3">
										{#if r.info?.icon}
											<div class="avatar">
												<div class="w-10 h-10 rounded">
													<img src={proxyAvatarUrl(r.info.icon)} alt="Relay icon" />
												</div>
											</div>
										{:else}
											<div class="avatar placeholder">
												<div
													class="bg-base-300 text-base-content w-10 h-10 rounded flex items-center justify-center"
												>
													<Icon icon="mingcute:server-line" class="text-lg" />
												</div>
											</div>
										{/if}
										<div class="min-w-0">
											<div class="text-xs opacity-70 truncate">{r.url}</div>
										</div>
										<div class="ml-auto absolute left-2 top-2">
											{#if r.status === 'open' || r.status === 'connected'}
												<Icon icon="mingcute:check-circle-fill" class="text-success" />
											{:else if r.status === 'connecting'}
												<Icon icon="mingcute:time-line" class="text-warning" />
											{:else if r.status === 'close'}
												<Icon icon="codicon:debug-disconnect" />
											{:else if r.status === 'failed'}
												<Icon icon="icon-park-solid:applet-closed" class="text-red-500" />
											{/if}
										</div>
									</div>
									{#if r.info?.description}
										<p class="text-sm mt-2 line-clamp-3">{r.info.description}</p>
									{/if}
									<div class="mt-2 flex flex-wrap gap-2 text-xs opacity-70">
										{#if r.info?.software}<span>SW: {r.info.software}</span>{/if}
										{#if r.info?.version}<span>v{r.info.version}</span>{/if}
										{#if r.info?.supported_nips?.length}
											<span
												>NIPs: {r.info.supported_nips.slice(0, 6).join(', ')}{r.info.supported_nips
													.length > 6
													? '…'
													: ''}</span
											>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				</VirtualList>
			{/if}
		</div>
	</div>
</div>
