<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import type { EventTemplate } from 'nostr-tools';

	import Editor from 'src/components/Editor.svelte';
	import { now } from 'src/lib/period';
	import { isKind4, type AnyKind, type Kind1Parsed } from 'src/types';
	import Message from 'src/routes/_kinds/message.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { key, kind10002 } from 'src/controller';
	import { nostrManager, type RelayStatus, type SubscribeKind } from 'src/model/nostr';
	import type { ParsedEvent } from 'src/types';
	import { parseContent } from 'src/lib';

	// in a chat, pubkey is the other person's pubkey
	export let pubkey: string;
	export let visible: boolean;

	let feedRequests: any[] = [];
	let message: string = '';

	let sent: EventTemplate;
	let feed: [ParsedEvent<Kind1Parsed>, ...ParsedEvent<AnyKind>[]][] = [];

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: SubscribeKind
	) {
		const [event, ...context] = events;
		const lastEvent = feed?.[feed.length - 1]?.[0];
		let firstEvent = feed?.[0]?.[0];
		if (firstEvent && firstEvent.id == sent?.id) {
			firstEvent = feed?.[1]?.[0];
		}
		if (isKind4(event)) {
			if (lastEvent?.pubkey != event.pubkey) {
				if (lastEvent) {
					lastEvent.isFirst = true;
				}
				event.isLast = true;
			}
			if (event.pubkey == pubkey) {
				event.incoming = true;
			}
			if (event.created_at == sent?.created_at) {
				sent = undefined;
				if (firstEvent) firstEvent.isLast = false;
				event.isLast = true;
				return [[event, ...context], ...feed.slice(1)];
			}
			if (firstEvent?.created_at || 0 < event.created_at) {
				return [...feed, [event, ...context]];
			} else {
				if (firstEvent) firstEvent.isLast = false;
				return [[event, ...context], ...feed];
			}
		} else {
			return feed;
		}
	}

	$: {
		if ($key?.pub) {
			feedRequests = [
				{
					kinds: [4],
					tags: { '#p': [$key?.pub] },
					authors: [pubkey],
					limit: 200,
					relays: $kind10002?.parsed?.filter((r) => r.read).map((r) => r.url) || [],
					noOptimize: true
				},
				{
					kinds: [4],
					tags: { '#p': [pubkey] },
					authors: [$key?.pub],
					limit: 200,
					relays: $kind10002?.parsed?.filter((r) => r.write).map((r) => r.url) || [],
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
			sent.id = _.random(100000);
			sent.isLast = true;
			sent.incoming = false;
			sent.parsed = {};
			sent.parsed.parsedContent = await parseContent(event.content);
			sent.status = 'pending';
			const firstEvent = feed?.[0]?.[0];
			if (firstEvent) {
				firstEvent.isLast = false;
			}

			feed = [[sent], ...feed];

			nostrManager.publish('4' + content, event, (status: RelayStatus) => {
				// sent.status = 'sending';
			});
		} catch (error) {
			console.error('Error sending message:', error);
		}
	}
</script>

<Feed
	subscriptionID={'kind4_' + $page.params.pubkey}
	requests={feedRequests}
	{updateFeed}
	{visible}
	bottom={true}
	className="w-feed"
>
	<svelte:fragment slot="fixed-header">
		<div
			class="fixed pt-safe flex justify-between items-center lg:w-50vw py-2 w-full backdrop-blur-xl bg-transparent h-20 z-10"
		>
			<a href="/chat">
				<Icon icon="mingcute:left-line" class="text-2xl" />
			</a>
			{#key pubkey}
				<div class="flex items-center gap-4">
					<Avatar pubkey={pubkey || ''} size="lg" context={[]} />
					<User pubkey={pubkey || ''} link={false} context={[]} />
				</div>
			{/key}
			<div />
		</div>
		<div class="fixed bottom-0 w-feed px-2 py-4 pr-5 backdrop-blur-xl">
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
		<div class="h-24" />
	</svelte:fragment>
	<svelte:fragment slot="item-content" let:post let:context let:visible>
		<Message message={post} {context} />
	</svelte:fragment>
</Feed>
