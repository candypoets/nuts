<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getEventHash, type UnsignedEvent } from 'nostr-tools';

	import type { ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import { Kind4ParsedT, ParsedData, ParsedEventT } from '@candypoets/nipworker';
	import { usePublish } from '@candypoets/nipworker/hooks';
	import { asParsedEvent, parseContent } from '@candypoets/nipworker/utils';
	import Editor from 'src/components/Editor.svelte';
	import { key, readRelays, writeRelays } from 'src/controller';
	import { toParsedEvent } from 'src/controller/feed';
	import { now } from 'src/lib/period';
	import Message from 'src/routes/_kinds/message.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { go } from '../modals/modal';
	import EmojiPicker from 'src/components/EmojiPicker.svelte';
	import GifPicker from 'src/components/GIFPicker.svelte';
	import type { Readable } from 'svelte/motion';

	// in a chat, pubkey is the other person's pubkey
	export let pubkey: string;
	export let visible: boolean;
	export let goBack: () => void;

	let showPicker = false;

	let feedRequests: any[] = [];
	let message: string = '';

	let sent: ParsedEvent;
	let feed: ParsedEvent[] = [];

	let editor: Readable<Editor>;

	let sendingMap = new Map<number, number>();

	function updateFeed(feed: ParsedEvent[], message: WorkerMessage) {
		const parsedEvent = asParsedEvent(message);
		if (parsedEvent) {
			if (sendingMap.has(parsedEvent.createdAt())) {
				// firstEvent = feed?.[1];
				sendingMap.set(parsedEvent.createdAt(), 0);
				return feed;
			}
			switch (parsedEvent?.parsedType()) {
				case ParsedData.Kind4Parsed:
					return [parsedEvent, ...feed];
				default:
					return feed;
			}
		}
	}

	$: {
		if ($key?.pub) {
			feedRequests = [
				{
					kinds: [4],
					tags: { '#p': [$key?.pub] },
					authors: [pubkey],
					limit: 20,
					relays: $readRelays,
					noOptimize: true
				},
				{
					kinds: [4],
					tags: { '#p': [pubkey] },
					authors: [$key?.pub],
					limit: 20,
					relays: $writeRelays,
					noOptimize: true
				}
			];
		}
	}

	function getEventId(event: ParsedEvent) {
		return event.createdAt();
	}
	async function handleMessageSubmit(content: string) {
		if (!content.trim()) return;

		try {
			const event: UnsignedEvent = {
				kind: 4,
				pubkey: $key?.pub,
				content: content.trim(),
				created_at: now(),
				tags: [['p', pubkey]]
			};

			// event.id = getEventHash(event);
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

			sendingMap.set(newEvent.createdAt(), event.created_at);

			feed = [newEvent, ...feed];

			usePublish('4' + event.content, event);
		} catch (error) {
			console.error('Error sending message:', error);
		}
	}

	function oneDayDiff(firstTimestampInSeconds: number, secondTimestampInSeconds: number): boolean {
		const differenceInSeconds = Math.abs(firstTimestampInSeconds - secondTimestampInSeconds);

		return differenceInSeconds > 86_400;
	}

	$: feed = feed.sort((a, b) => b.createdAt() - a.createdAt());

	function toggleGifPicker() {
		showPicker = !showPicker;
		// $editor?.commands.focus();
	}
</script>

<Feed
	subscriptionID={'kind4_' + pubkey}
	requests={feedRequests}
	{updateFeed}
	{visible}
	bottom={true}
	bind:feed
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
				class="!rounded-full"
				onSubmit={handleMessageSubmit}
				bind:editor
				bind:showPicker
				sendButton
				autofocus
			>
				<svelte:fragment slot="toolbar">
					<button
						type="button"
						class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
						title="Insert GIF"
						on:click={toggleGifPicker}
						data-gif-trigger
					>
						<Icon icon="mage:gif" class="w-5 h-5" />
					</button>
				</svelte:fragment>
				<div class="md:px-2">Message</div>
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
				feed[index + 1]?.pubkey?.()?.fnv1aHash() != post.pubkey?.()?.fnv1aHash()}
			isLast={index === feed.length - 1 ||
				feed[index - 1]?.pubkey?.()?.fnv1aHash() != post.pubkey?.()?.fnv1aHash()}
			incoming={post.pubkey()?.toString() == pubkey}
			lastSent={post.pubkey()?.toString() == pubkey && index == feed.length - 1}
			date={feed.length - 1 == index || oneDayDiff(post.createdAt(), feed[index - 1]?.createdAt())}
			sent={sendingMap.get(post.createdAt())}
		/>
	</svelte:fragment>
</Feed>
