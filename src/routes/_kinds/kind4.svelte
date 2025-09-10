<script lang="ts">
	import Icon from '@iconify/svelte';
	import { random } from 'lodash';
	import type { EventTemplate } from 'nostr-tools';

	import type { ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import { nostrManager, ParsedData } from '@candypoets/nipworker';
	import { asParsedEvent } from '@candypoets/nipworker/utils';
	import Editor from 'src/components/Editor.svelte';
	import { key, readRelays, writeRelays } from 'src/controller';
	import { parseContent } from 'src/lib';
	import { now } from 'src/lib/period';
	import Message from 'src/routes/_kinds/message.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { chatManager } from 'src/controller/managers';

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
		feed = feed.sort((a, b) => (b.createdAt() || 0) - (a.createdAt() || 0));
		const lastEvent = feed?.[feed.length - 1];
		let firstEvent = feed?.[0];
		if (firstEvent && firstEvent.id()?.toString() == sent?.id) {
			firstEvent = feed?.[1];
		}
		const parsedEvent = asParsedEvent(message);
		if (parsedEvent) {
			switch (parsedEvent?.parsedType()) {
				case ParsedData.Kind4Parsed:
					if (lastEvent?.pubkey?.()?.fnv1aHash() != parsedEvent.pubkey?.()?.fnv1aHash()) {
						if (lastEvent) {
							lastEvent.isFirst = true;
						}
						parsedEvent.isLast = true;
					}
					if (parsedEvent.pubkey?.()?.toString() == pubkey) {
						parsedEvent.incoming = true;
					}
					if (parsedEvent.createdAt() == sent?.created_at) {
						sent = undefined;
						if (firstEvent) firstEvent.isLast = false;
						parsedEvent.isLast = true;
						return [parsedEvent, ...feed.slice(1)];
					}
					if (firstEvent?.created_at || 0 < parsedEvent.createdAt()) {
						return [...feed, parsedEvent];
					} else {
						if (firstEvent) firstEvent.isLast = false;
						return [parsedEvent, ...feed];
					}
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

			nostrManager.publish('4' + content, event);
		} catch (error) {
			console.error('Error sending message:', error);
		}
	}
</script>

<Feed
	subscriptionID={'kind4_' + pubkey}
	requests={feedRequests}
	manager={chatManager}
	{updateFeed}
	{visible}
	bottom={true}
	class="w-feed"
	backdrop
>
	<svelte:fragment slot="fixed-header">
		<div
			class="fixed pt-safe flex justify-between items-center lg:w-50vw py-2 w-full backdrop-blur-xl h-20 z-10"
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
	<svelte:fragment slot="item-content" let:post let:visible>
		<Message message={post} />
	</svelte:fragment>
</Feed>
