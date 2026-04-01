<script lang="ts">
	import {
		MessageType,
		MuteFilterPipeConfigT,
		PipeConfig,
		PipeT,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { nip19 } from 'nostr-tools';
	import type { EventPointer } from 'nostr-tools/nip19';
	import { onDestroy, onMount } from 'svelte';
	import ModalHandle from 'src/components/ModalHandle.svelte';
	import VirtualList from 'src/components/VirtualList.svelte';
	import { getContext } from 'svelte';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';

	import {
		asConnectionStatus,
		asKind1111,
		asParsedEvent,
		ConnectionTracker,
		fbArray
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { isMobile } from 'src/controller';
	import { getUserRelays } from 'src/routes/queries/user';
	import CommentItem from './CommentItem.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';

	export let noteId: string | undefined = undefined;

	let animator: PagerAnimator = getContext('animator');
	let decoded: EventPointer | null = null;
	let error: string | null = null;
	let relays: string[] = [];
	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	// Comments list
	let comments: ParsedEvent[] = [];

	// Connection tracking
	let connectionStatus: { [url: string]: ConnectionStatus } = {};
	let connectionTracker = new ConnectionTracker();
	let loading = true;

	// Flatten comment tree for VirtualList
	$: flatComments = flattenCommentTree(buildCommentTree(comments));

	function flattenCommentTree(nodes: CommentNode[]): Array<{event: ParsedEvent; depth: number}> {
		const result: Array<{event: ParsedEvent; depth: number}> = [];
		function traverse(nodeList: CommentNode[]) {
			for (const node of nodeList) {
				result.push({ event: node.event, depth: node.depth });
				if (node.children.length > 0) {
					traverse(node.children);
				}
			}
		}
		traverse(nodes);
		return result;
	}

	interface CommentNode {
		event: ParsedEvent;
		children: CommentNode[];
		depth: number;
	}

	onMount(() => {
		if (!noteId) {
			error = 'No note ID provided';
			return;
		}

		try {
			const decodedResult = nip19.decode(noteId);
			if (decodedResult.type === 'nevent') {
				decoded = decodedResult.data;
				relays = decoded.relays?.slice(0, 5) || [];
			} else if (decodedResult.type === 'note') {
				decoded = { id: decodedResult.data, relays: [] };
			} else {
				error = 'Invalid note ID format';
				return;
			}
		} catch (e) {
			error = 'Failed to decode note ID';
			return;
		}

		if (decoded) {
			subscribe();
		}
	});

	function buildCommentTree(commentsList: ParsedEvent[]): CommentNode[] {
		if (!decoded) return [];

		const rootId = decoded.id;
		const nodeMap = new Map<string, CommentNode>();
		const rootNodes: CommentNode[] = [];

		// First pass: create all nodes
		commentsList.forEach((comment) => {
			nodeMap.set(comment.id()!, {
				event: comment,
				children: [],
				depth: 0
			});
		});

		// Second pass: build tree
		commentsList.forEach((comment) => {
			const kind1111 = asKind1111(comment);
			if (!kind1111) return;

			const node = nodeMap.get(comment.id()!);
			if (!node) return;

			const parentId = kind1111.parentId?.();
			const rootEventId = kind1111.rootId?.();

			if (parentId && parentId !== rootId && nodeMap.has(parentId)) {
				const parent = nodeMap.get(parentId);
				if (parent) {
					node.depth = parent.depth + 1;
					parent.children.push(node);
				}
			} else if (rootEventId === rootId || !parentId) {
				rootNodes.push(node);
			}
		});

		// Sort by created_at
		const sortByTime = (a: CommentNode, b: CommentNode) =>
			a.event.createdAt() - b.event.createdAt();
		rootNodes.sort(sortByTime);
		rootNodes.forEach((node) => {
			node.children.sort(sortByTime);
		});

		return rootNodes;
	}

	function handleEvents(message: WorkerMessage) {
		switch (message.type()) {
			case MessageType.ConnectionStatus:
				const status = asConnectionStatus(message);
				if (status?.relayUrl()) {
					const normalizedUrl = normalizeURL(status.relayUrl()!);
					connectionStatus[normalizedUrl] = status;
					connectionTracker.handleMessage(message);
					if (connectionTracker.resolutionRate > 0.5) {
						loading = false;
					}
				}
				break;
			case MessageType.Eose:
			case MessageType.Eoce:
				if (connectionTracker.resolutionRate >= 0.5) {
					loading = false;
				}
				break;
			case MessageType.ParsedNostrEvent:
				const parsed = asParsedEvent(message);
				if (parsed) {
					const kind = parsed.kind();
					if (kind === 1111) {
						const kind1111 = asKind1111(parsed);
						if (kind1111) {
							if (!comments.some((c) => c.id() === parsed.id())) {
								comments = [...comments, parsed];
							}
						}
					}
				}
				break;
		}
	}

	function subscribe() {
		if (!decoded) return;

		loading = true;
		connectionTracker = new ConnectionTracker();

		relaysub = getUserRelays(decoded.author || '', (result) => {
			if (relays.length === 0) {
				relays = result.slice(0, $isMobile ? 3 : 5);
			}

			sub = useSubscription(
				'kind1111_modal_' + decoded!.id,
				[
					{
						kinds: [1111],
						tags: { '#E': [decoded!.id] },
						relays: relays.length > 0 ? relays : ['wss://nostr.wine'],
						noContext: true
					}
				],
				handleEvents,
				{
					pipeline: [
						new PipeT(PipeConfig.MuteFilterPipeConfig, new MuteFilterPipeConfigT([], [], [], []))
					],
					bytesPerEvent: 5 * 1024
				}
			);
		});
	}

	function unsubscribe() {
		sub?.();
		relaysub?.();
		sub = undefined;
		relaysub = undefined;
	}

	onDestroy(unsubscribe);

	$: if (loading) {
		setTimeout(() => {
			loading = false;
		}, 5000);
	}

	const getItemId = (item: {event: ParsedEvent; depth: number}) => item.event.id()!;
</script>

<div class="h-screen flex items-end" on:click={animator.goBack}>
	<div
		class="bg-base-300 bg-opacity-85 w-full !h-2/3 !min-h-fit rounded-t-2xl md:rounded-xl md:h-1/2 flex flex-col shadow-widget"
		on:click|stopPropagation
	>
		<ModalHandle />

		<!-- Header -->
		<div class="px-4 flex justify-center h-16 items-center shrink-0">
			<div class="flex items-center gap-2">
				<Icon icon="mdi:comment-multiple-outline" class="text-xl text-primary" />
				<h2 class="text-xl font-bold">Comments</h2>
				<span class="text-sm text-base-content/60">({comments.length})</span>
			</div>
		</div>

		<!-- RelaysList -->
		<div class="px-4 py-2 border-y border-base-200 bg-base-200/50 shrink-0">
			<RelaysList subId={'kind1111_' + (decoded?.id || '')} {relays} {connectionStatus} mini />
		</div>

		<!-- Content with VirtualList -->
		<div class="px-2 pb-safe flex-1 min-h-0 overflow-hidden">
			{#if error}
				<div class="flex flex-col items-center justify-center py-8 text-error">
					<Icon icon="mdi:alert-circle" class="text-4xl mb-2" />
					<p>{error}</p>
				</div>
			{:else if loading && comments.length === 0}
				<div class="flex flex-col items-center justify-center py-8">
					<div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
					<p class="text-sm text-base-content/60">Loading comments...</p>
				</div>
			{:else if comments.length === 0}
				<div class="flex flex-col items-center justify-center py-8 text-base-content/60">
					<Icon icon="mdi:comment-outline" class="text-4xl mb-2 opacity-50" />
					<p>No comments yet</p>
					<p class="text-sm opacity-50">Be the first to comment!</p>
				</div>
			{:else}
				<VirtualList
					items={flatComments}
					{getItemId}
					itemsPerRow={1}
					height="100%"
					itemHeight={60}
					className="w-full !max-h-none"
					let:item
					let:items
				>
					{#each items as comment (comment.event.id())}
						<div class="px-2 py-2">
							<CommentItem node={{ event: comment.event, children: [], depth: comment.depth }} />
						</div>
					{/each}
				</VirtualList>
			{/if}
		</div>
	</div>
</div>
