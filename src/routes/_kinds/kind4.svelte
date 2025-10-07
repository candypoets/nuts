<script lang="ts">
	import Icon from '@iconify/svelte';
	import { random } from 'lodash';
	import type { EventTemplate } from 'nostr-tools';

	import type { ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import { ParsedData } from '@candypoets/nipworker';
	import { asParsedEvent } from '@candypoets/nipworker/utils';
	import Editor from 'src/components/Editor.svelte';
	import { key, readRelays, writeRelays } from 'src/controller';
	import { parseContent } from 'src/lib';
	import { now } from 'src/lib/period';
	import Message from 'src/routes/_kinds/message.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { usePublish } from '@candypoets/nipworker/hooks';

	// in a chat, pubkey is the other person's pubkey
	export let pubkey: string;
	export let visible: boolean;
	export let goBack: () => void;

	let feedRequests: any[] = [];
	let message: string = '';

	let sent: EventTemplate;
	let feed: ParsedEvent[] = [];

	function updateFeed(feed: ParsedEvent[], message: WorkerMessage) {
		// Reorder feed by created_at, most recent first
		// feed = feed.sort((a, b) => (b.createdAt() || 0) - (a.createdAt() || 0));
		const lastEvent = feed?.[feed.length - 1];
		let firstEvent = feed?.[0];
		if (firstEvent && firstEvent.id()?.toString() == sent?.id) {
			firstEvent = feed?.[1];
		}
		const parsedEvent = asParsedEvent(message);
		if (parsedEvent) {
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
	async function handleMessageSubmit(content: string) {
		if (!content.trim()) return;

		try {
			const event: EventTemplate = {
				kind: 4,
				content: content.trim(),
				created_at: now(),
				tags: [['p', pubkey]]
			};

			// Reset message after sending
			message = '';

			sent = { ...event };
			sent.id = () => ({ fnv1aHash: () => random(100000) });
			sent.isLast = true;
			sent.incoming = false;
			sent.parsed = {};
			sent.parsed.parsedContent = await parseContent(event.content);
			sent.status = 'pending';
			const firstEvent = feed?.[0]?.[0];
			if (firstEvent) {
				firstEvent.isLast = false;
			}

			feed = [sent, ...feed];

			usePublish('4' + content, event);
		} catch (error) {
			console.error('Error sending message:', error);
		}
	}

	function oneDayDiff(firstTimestampInSeconds: number, secondTimestampInSeconds: number): boolean {
		const differenceInSeconds = Math.abs(firstTimestampInSeconds - secondTimestampInSeconds);

		return differenceInSeconds > 86_400;
	}

	$: feed = feed.sort((a, b) => b.createdAt() - a.createdAt());
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
			class="fixed pt-safe flex justify-between items-center lg:w-50vw py-2 w-full h-20 z-10 bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg"
			style="-webkit-backdrop-filter: blur(12px);"
		>
			<div on:click={goBack} class="cursor-pointer">
				<Icon icon="mingcute:left-line" class="text-2xl" />
			</div>
			{#key pubkey}
				<div class="flex items-center gap-4">
					<Avatar pubkey={pubkey || ''} size="lg" context={[]} />
					<User pubkey={pubkey || ''} link={false} context={[]} />
				</div>
			{/key}
			<div />
		</div>
		<div
			class="fixed bottom-0 w-feed pb-safe md:pb-4 backdrop-blur-xl"
			style="-webkit-backdrop-filter: blur(12px);"
		>
			<Editor
				placeholder="Message..."
				initialContent=""
				isCompact={true}
				submitOnEnter={true}
				onSubmit={handleMessageSubmit}
			/>
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
		/>
	</svelte:fragment>
</Feed>
