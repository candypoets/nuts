<script lang="ts">
	import {
		MuteFilterPipeConfigT,
		PipeConfig,
		PipeT,
		SaveToDbPipeConfigT,
		SerializeEventsPipeConfigT,
		type NostrEvent as RawNostrEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asNostrEvent } from '@candypoets/nipworker/utils';
	import { onDestroy } from 'svelte';

	import { mutePipeConfig } from 'src/controller/nostr';
	import { HIGHLIGHT_KIND } from 'src/lib/highlights';

	export let noteId: string;
	export let relays: string[] = [];
	export let visible = false;
	export let kind: number | undefined = undefined;
	export let onEvent: ((event: RawNostrEvent) => void) | undefined = undefined;

	interface $$Slots {
		default: { event: RawNostrEvent };
		fallback: Record<string, never>;
	}

	let highlight: RawNostrEvent | undefined;
	let sub: (() => void) | undefined;
	let currentTarget = '';

	function highlightPipeline(subId: string, muteConfig: MuteFilterPipeConfigT): PipeT[] {
		return [
			new PipeT(PipeConfig.MuteFilterPipeConfig, muteConfig),
			new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
			new PipeT(
				PipeConfig.SerializeEventsPipeConfig,
				new SerializeEventsPipeConfigT(new TextEncoder().encode(subId))
			)
		];
	}

	function unsubscribe() {
		sub?.();
		sub = undefined;
	}

	function subscribe(target: string, id: string, relayHints: string[]) {
		if (sub && currentTarget === target) return;

		unsubscribe();
		currentTarget = target;
		highlight = undefined;

		const subId = `highlight_${id}`;
		sub = useSubscription(
			subId,
			[
				{
					ids: [id],
					kinds: [HIGHLIGHT_KIND],
					limit: 1,
					relays: relayHints,
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const event = asNostrEvent(message);
				if (event?.id() === id && event.kind() === HIGHLIGHT_KIND) {
					highlight = event;
					onEvent?.(event);
				}
			},
			{ pipeline: highlightPipeline(subId, $mutePipeConfig) }
		);
	}

	$: target = [noteId, ...relays].join('\n');
	$: visible && noteId ? subscribe(target, noteId, relays) : unsubscribe();

	onDestroy(unsubscribe);
</script>

{#if highlight}
	<slot event={highlight} />
{:else if kind !== HIGHLIGHT_KIND}
	<slot name="fallback" />
{/if}
