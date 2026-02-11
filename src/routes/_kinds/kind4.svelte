<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getEventHash, type UnsignedEvent } from 'nostr-tools';

	import type { ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import { Kind4ParsedT, MessageType, ParsedData, ParsedEventT } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { asParsedEvent, fbArray, parseContent } from '@candypoets/nipworker/utils';
	import Editor from 'src/components/Editor.svelte';
	import { key, readRelays, writeRelays } from 'src/controller';
	import { toParsedEvent } from 'src/controller/feed';
	import { now } from 'src/lib/period';
	import Message from 'src/routes/_kinds/message.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { go } from '../modals/modal';
	import { onDestroy } from 'svelte';

	// in a chat, pubkey is the other person's pubkey
	export let pubkey: string;
	export let visible: boolean;
	export let goBack: () => void;

	let showPicker = false;
	let message: string = '';

	// Feed items managed by parent
	let dmItems: ParsedEvent[] = [];
	let rawEvents: ParsedEvent[] = [];
	let loading = false;

	// Track sent messages for optimistic UI and deduplication
	let sendingMap = new Map<string, number>();

	// Viewport state from Feed
	let start = 0;
	let end = 0;
	let bottom = true; // Chat-style scrolling from bottom

	function getNonce(post: ParsedEvent): string | undefined {
		const tags = fbArray(post, 'tags').reduce(
			(acc, tag) => {
				const items = fbArray(tag, 'items');
				if (items.length >= 2) {
					const key = items[0]?.toString();
					if (key) {
						acc[key] = items.slice(1).map((item) => item?.toString());
					}
				}
				return acc;
			},
			{} as Record<string, string[]>
		);
		return tags['nonce']?.[0];
	}

	// Build subscription requests for this conversation
	function buildRequests() {
		if (!$key?.pub) return [];
		return [
			{
				kinds: [4],
				tags: { '#p': [$key?.pub] },
				authors: [pubkey],
				limit: 50,
				relays: $readRelays,
				noOptimize: true
			},
			{
				kinds: [4],
				tags: { '#p': [pubkey] },
				authors: [$key?.pub],
				limit: 50,
				relays: $writeRelays,
				noOptimize: true
			}
		];
	}

	// Process raw events - sort by createdAt desc and deduplicate
	function processEvents(events: ParsedEvent[]): ParsedEvent[] {
		const seen = new Set<string>();
		return events
			.filter((event) => {
				const id = event.id()?.fnv1aHash();
				if (seen.has(id)) return false;
				seen.add(id);
				return true;
			})
			.sort((a, b) => b.createdAt() - a.createdAt());
	}

	// Reactive: process raw events into DM items
	$: dmItems = processEvents(rawEvents);

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		switch (message.type()) {
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (!parsedEvent) return;

				// Only process kind 4 events
				if (parsedEvent.kind() !== 4) return;

				const nonce = getNonce(parsedEvent);

				// Check if this is a response to our sent message (deduplication)
				if (nonce && sendingMap.has(nonce)) {
					sendingMap.delete(nonce);
					return;
				}

				// Deduplicate by id
				const eventId = parsedEvent.id()?.fnv1aHash();
				const exists = rawEvents.some((e) => e.id()?.fnv1aHash() === eventId);
				if (!exists) {
					rawEvents = [...rawEvents, parsedEvent];
				}
				break;
		}
	}

	// Initialize subscription
	let unsubscribe: (() => void) | undefined;

	$: if (visible && $key?.pub) {
		if (rawEvents.length === 0 && !loading) {
			loading = true;
			const requests = buildRequests();
			if (requests.length > 0) {
				unsubscribe?.();
				unsubscribe = useSubscription(
					'kind4_' + pubkey,
					requests,
					handleEvents
				);
			}
		}
	}

	async function handleMessageSubmit(content: string) {
		if (!content.trim()) return;

		try {
			// Generate a unique nonce for this message
			const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');

			const event: UnsignedEvent = {
				kind: 4,
				pubkey: $key?.pub,
				content: content.trim(),
				created_at: now(),
				tags: [
					['p', pubkey],
					['nonce', nonce]
				]
			};

			const textEncoder = new TextEncoder();
			const parsed = await parseContent(event.content);

			const parsedT = new Kind4ParsedT(
				parsed,
				textEncoder.encode(event.content),
				textEncoder.encode('chatId'),
				textEncoder.encode(pubkey)
			);

			const eventT = new ParsedEventT(
				textEncoder.encode(getEventHash(event)),
				textEncoder.encode(event.pubkey),
				event.kind,
				event.created_at,
				ParsedData.Kind4Parsed,
				parsedT
			);

			// Reset message after sending
			message = '';

			const newEvent = toParsedEvent(eventT);

			// Store nonce for deduplication and add to feed immediately (optimistic UI)
			sendingMap.set(nonce, Date.now());
			rawEvents = [newEvent, ...rawEvents];

			usePublish('4' + event.content, event);
		} catch (error) {
			console.error('Error sending message:', error);
		}
	}

	function oneDayDiff(firstTimestampInSeconds: number, secondTimestampInSeconds: number): boolean {
		const differenceInSeconds = Math.abs(firstTimestampInSeconds - secondTimestampInSeconds);
		return differenceInSeconds > 86_400;
	}

	function toggleGifPicker() {
		showPicker = !showPicker;
	}

	// Cleanup on unmount
	onDestroy(() => {
		unsubscribe?.();
	});
</script>

<Feed
	items={dmItems}
	getItemId={(item) => item?.id?.()?.fnv1aHash?.() ?? 0}
	{visible}
	{bottom}
	bind:start
	bind:end
	class="w-feed"
>
	<svelte:fragment slot="fixed-header">
		<div
			class="fixed pt-safe flex justify-between items-center lg:w-50vw py-2 w-full h-20 z-10 rounded-lg"
		>
			<button on:click={goBack} class="btn btn-sm btn-circle">
				<Icon icon="mingcute:left-line" class="text-2xl" />
			</button>
			{#key pubkey}
				<div
					class="flex items-center gap-2 bg-base-300 pr-2 rounded-full border"
					on:click={() => go('nprofile:' + pubkey)}
				>
					<Avatar pubkey={pubkey || ''} size="lg" context={[]} />
					<User pubkey={pubkey || ''} link={false} context={[]} />
				</div>
			{/key}
			<div />
		</div>
		<div
			class="fixed bottom-0 w-feed pb-safe md:pb-4 backdrop-blur-xl px-4 flex items-center"
			style="-webkit-backdrop-filter: blur(12px);"
		>
			<Editor
				initialContent=""
				isCompact={true}
				submitOnEnter={true}
				class="!rounded-full h-10 overflow-scroll no-scrollbar"
				onSubmit={handleMessageSubmit}
				bind:showPicker
				sendButton
				autofocus
			>
				<svelte:fragment slot="toolbar">
					<div class="bg-opacity-90 bg-base-300 rounded-full">
						<button
							type="button"
							class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
							title="Insert GIF"
							on:click={toggleGifPicker}
							data-gif-trigger
						>
							<Icon icon="mage:gif" class="w-5 h-5" />
						</button>
					</div>
				</svelte:fragment>
				<div class="md:px-2">Aa</div>
			</Editor>
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		<div class="h-24 unsafe-padding-top" />
	</svelte:fragment>
	<svelte:fragment slot="item-content" let:post let:visible let:index>
		<Message
			message={post}
			isFirst={index === 0 ||
				dmItems[index + 1]?.pubkey?.()?.fnv1aHash() != post.pubkey?.()?.fnv1aHash()}
			isLast={index === dmItems.length - 1 ||
				dmItems[index - 1]?.pubkey?.()?.fnv1aHash() != post.pubkey?.()?.fnv1aHash()}
			incoming={post.pubkey()?.toString() == pubkey}
			lastSent={post.pubkey()?.toString() == pubkey && index == dmItems.length - 1}
			date={dmItems.length - 1 == index || oneDayDiff(post.createdAt(), dmItems[index - 1]?.createdAt())}
			sent={sendingMap.get(getNonce(post) || '')}
		/>
	</svelte:fragment>
</Feed>
