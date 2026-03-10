<script lang="ts">
	import type { Kind10002Parsed, WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind10002, asParsedEvent, fbArray } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';

	import { key, kind10002Ready, lastNotificationView } from 'src/controller';
	import { go } from 'src/routes/modals/modal';
	let missed = 0;

	kind10002Ready.promise.then((result) => {
		const kind10002 = asKind10002(result) as Kind10002Parsed;
		useSubscription(
			'notifications',
			[
				{
					kinds: [1, 7, 6],
					tags: { '#p': [$key?.pub] },
					limit: 100,
					relays:
						fbArray(kind10002, 'relays')
							?.filter((r) => r.write() == true)
							.map((r) => r.url()) || []
				}
			],
			(message: WorkerMessage) => {
				const parsedEvent = asParsedEvent(message);
				if (parsedEvent)
					if (parsedEvent?.createdAt() > $lastNotificationView / 1000) {
						missed++;
					}
			}
		);
	});

	$: if ($lastNotificationView > Date.now() - 1000) {
		missed = 0;
	}
</script>

<div class="indicator cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
	<div
		class="w-2 h-2 bg-accent rounded-full indicator-item indicator-center"
		class:hidden={!missed}
	></div>

	<Icon icon="mdi:bell-outline" class="text-2xl mr-2" />
</div>
