<script lang="ts">
	import Icon from '@iconify/svelte';
	import { key, kind10002Ready, lastNotificationView } from 'src/controller';
	import { nostrManager, useSubscription, type SubscribeKind } from 'src/model/nostr-main';
	import { go } from '../modals/modal';
	import type { AnyKind, ParsedEvent } from 'src/types';
	import { DAY } from 'src/lib/period';

	let missed = 0;

	kind10002Ready.promise.then((result) => {
		useSubscription(
			'notifications',
			[
				{
					kinds: [1, 7, 6],
					tags: { '#p': [$key?.pub] },
					limit: 100,
					relays: result.parsed?.filter((r) => r.write == true).map((r) => r.url) || []
				}
			],
			(events: ParsedEvent<AnyKind>[], eventKind: SubscribeKind) => {
				if (events[0]?.created_at > $lastNotificationView / 1000) {
					missed++;
				}
			}
		);
	});
</script>

<div class="indicator cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
	<div
		class="w-2 h-2 bg-accent rounded-full indicator-item indicator-center"
		class:hidden={!missed}
	></div>

	<Icon icon="mdi:bell-outline" class="text-2xl mr-2" />
</div>
