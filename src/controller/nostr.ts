import {
	MuteFilterPipeConfigT,
	ParsePipeConfigT,
	PipeConfig,
	PipeT,
	SaveToDbPipeConfigT,
	SerializeEventsPipeConfigT,
	type Kind3Parsed,
	type ParsedEvent
} from '@candypoets/nipworker';
import { asKind10002, asKind3, fbArray } from '@candypoets/nipworker/utils';
import { derived, writable, type Writable } from 'svelte/store';

export const resolvable = <T = any>() => {
	let resolve: (args?: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res as (args?: T) => void;
	});
	return {
		promise,
		resolve: (args?: T) => resolve(args)
	};
};

export const kind0: Writable<ParsedEvent | undefined> = writable();

export const kind0Ready = resolvable<ParsedEvent>();

export const kind3: Writable<ParsedEvent | undefined> = writable();

export const follows = derived(kind3, ($kind3) => {
	return $kind3
		? fbArray(asKind3($kind3) as Kind3Parsed, 'contacts').map((c) => ({
				pubkey: c.pubkey()?.toString(),
				relay: c.relays(0)?.toString()
			}))
		: [];
});

export const kind3Ready = resolvable<ParsedEvent>();

export const kind10000: Writable<ParsedEvent | undefined> = writable();

// Muted pubkeys from content JSON (legacy format) + p tags
export const mutedPubkeys = derived(kind10000, ($kind10000) => {
	if (!$kind10000) return [];
	const pubkeys = new Set<string>();

	// From content field (JSON array) - encrypted in future but plain for now
	try {
		const content = $kind10000.content()?.toString() || '[]';
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			parsed.forEach((p) => {
				if (typeof p === 'string') pubkeys.add(p);
			});
		}
	} catch (e) {
		// Invalid JSON, ignore
	}

	// From p tags
	const tags = $kind10000.tags() || [];
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag && tag[0] === 'p' && tag[1]) {
			pubkeys.add(tag[1] as string);
		}
	}

	return Array.from(pubkeys);
});

// Muted hashtags from t tags
export const mutedHashtags = derived(kind10000, ($kind10000) => {
	if (!$kind10000) return [];
	const hashtags: string[] = [];
	const tags = $kind10000.tags() || [];
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag && tag[0] === 't' && tag[1]) {
			hashtags.push(tag[1] as string);
		}
	}
	return hashtags;
});

// Muted words from 'word' tags
export const mutedWords = derived(kind10000, ($kind10000) => {
	if (!$kind10000) return [];
	const words: string[] = [];
	const tags = $kind10000.tags() || [];
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag && tag[0] === 'word' && tag[1]) {
			words.push(tag[1] as string);
		}
	}
	return words;
});

// Muted event IDs from e tags
export const mutedEventIds = derived(kind10000, ($kind10000) => {
	if (!$kind10000) return [];
	const eventIds: string[] = [];
	const tags = $kind10000.tags() || [];
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag && tag[0] === 'e' && tag[1]) {
			eventIds.push(tag[1] as string);
		}
	}
	return eventIds;
});

// Pipe config for use in pipelines
export const mutePipeConfig = derived(
	[mutedPubkeys, mutedHashtags, mutedWords, mutedEventIds],
	([$pubkeys, $hashtags, $words, $eventIds]) => {
		return new MuteFilterPipeConfigT($pubkeys, $hashtags, $words, $eventIds);
	}
);

// Default pipeline with mute filter - use this for most subscriptions
export function createDefaultPipeline(subId: string): PipeT[] {
	return [
		new PipeT(PipeConfig.MuteFilterPipeConfig, new MuteFilterPipeConfigT([], [], [], [])),
		new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
		new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
		new PipeT(
			PipeConfig.SerializeEventsPipeConfig,
			new SerializeEventsPipeConfigT(new TextEncoder().encode(subId))
		)
	];
}

// Default pipeline store - reactive version that includes current mutes
export const defaultPipeline = derived(mutePipeConfig, ($muteConfig) => {
	return {
		// Get pipeline for a specific subscription ID
		for(subId: string): PipeT[] {
			return [
				new PipeT(PipeConfig.MuteFilterPipeConfig, $muteConfig),
				new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
				new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
				new PipeT(
					PipeConfig.SerializeEventsPipeConfig,
					new SerializeEventsPipeConfigT(new TextEncoder().encode(subId))
				)
			];
		}
	};
});

// Legacy mutes store (keep for backward compatibility)
export const mutes = mutedPubkeys;

export const kind10000Ready = resolvable<ParsedEvent>();

export const kind10002: Writable<ParsedEvent | undefined> = writable();

export const kind10002Ready = resolvable<ParsedEvent>();

export const kind10019: Writable<ParsedEvent | undefined> = writable();

export const kind10019Ready = resolvable<ParsedEvent>();

export const kind17375: Writable<ParsedEvent | undefined> = writable();

// File storage server events (kind 10063 = Blossom, kind 10096 = NIP-96)
export const kind10063: Writable<ParsedEvent | undefined> = writable();
export const kind10096: Writable<ParsedEvent | undefined> = writable();

export const kind10063Ready = resolvable<ParsedEvent>();
export const kind10096Ready = resolvable<ParsedEvent>();

// Derived stores for file server URLs
export const blossomServers = derived(kind10063, ($kind10063) => {
	if (!$kind10063) return [];
	const tags = $kind10063.tags() || [];
	const servers: string[] = [];
	for (const tag of tags) {
		if (tag && tag[0] === 'server' && tag[1]) {
			servers.push(tag[1] as string);
		}
	}
	return servers;
});

export const nip96Servers = derived(kind10096, ($kind10096) => {
	if (!$kind10096) return [];
	const tags = $kind10096.tags() || [];
	const servers: string[] = [];
	for (const tag of tags) {
		if (tag && tag[0] === 'server' && tag[1]) {
			servers.push(tag[1] as string);
		}
	}
	return servers;
});

// Preferred upload server (Blossom takes precedence, then NIP-96, fallback to default)
export const preferredUploadServer = derived(
	[blossomServers, nip96Servers],
	([$blossom, $nip96]) => {
		if ($blossom.length > 0) {
			return { type: 'blossom' as const, servers: $blossom };
		}
		if ($nip96.length > 0) {
			return { type: 'nip96' as const, servers: $nip96 };
		}
		return null;
	}
);

export const kinds7375: Writable<ParsedEvent[]> = writable([]);

export const readRelays = derived(kind10002, ($kind10002) => {
	let relays: string[] = [];
	if (!$kind10002) return relays;
	const kind = asKind10002($kind10002);
	if (!kind) return relays;
	return fbArray(kind, 'relays')
		.filter((r) => r.read())
		.map((r) => r.url()?.toString());
});

export const writeRelays = derived(kind10002, ($kind10002) => {
	let relays: string[] = [];
	if (!$kind10002) return relays;
	const kind = asKind10002($kind10002);
	if (!kind) return relays;
	return fbArray(kind, 'relays')
		.filter((r) => r.write())
		.map((r) => r.url()?.toString());
});

export const delayedPromise = new Promise<void>((resolve) => {
	setTimeout(() => {
		resolve();
	}, 2000);
});

// Helper to create kind:10000 mute event template
export function createMuteTemplate(
	pubkeys: string[],
	hashtags: string[],
	words: string[],
	eventIds: string[]
): { kind: number; created_at: number; tags: string[][]; content: string } {
	const tags: string[][] = [
		...pubkeys.map((p) => ['p', p]),
		...hashtags.map((t) => ['t', t]),
		...words.map((w) => ['word', w]),
		...eventIds.map((e) => ['e', e])
	];

	return {
		kind: 10000,
		created_at: Math.floor(Date.now() / 1000),
		tags,
		content: JSON.stringify(pubkeys)
	};
}

// Toggle a pubkey in the mute list
export function toggleMutePubkey(
	currentKind10000: ParsedEvent | undefined,
	pubkey: string
): { kind: number; created_at: number; tags: string[][]; content: string } {
	const currentPubkeys = currentKind10000 ? getMutedPubkeysFromEvent(currentKind10000) : [];
	const currentHashtags = currentKind10000 ? getMutedHashtagsFromEvent(currentKind10000) : [];
	const currentWords = currentKind10000 ? getMutedWordsFromEvent(currentKind10000) : [];
	const currentEventIds = currentKind10000 ? getMutedEventIdsFromEvent(currentKind10000) : [];

	const isMuted = currentPubkeys.includes(pubkey);
	const newPubkeys = isMuted
		? currentPubkeys.filter((p) => p !== pubkey)
		: [...currentPubkeys, pubkey];

	return createMuteTemplate(newPubkeys, currentHashtags, currentWords, currentEventIds);
}

// Toggle a hashtag in the mute list
export function toggleMuteHashtag(
	currentKind10000: ParsedEvent | undefined,
	hashtag: string
): { kind: number; created_at: number; tags: string[][]; content: string } {
	const currentPubkeys = currentKind10000 ? getMutedPubkeysFromEvent(currentKind10000) : [];
	const currentHashtags = currentKind10000 ? getMutedHashtagsFromEvent(currentKind10000) : [];
	const currentWords = currentKind10000 ? getMutedWordsFromEvent(currentKind10000) : [];
	const currentEventIds = currentKind10000 ? getMutedEventIdsFromEvent(currentKind10000) : [];

	const isMuted = currentHashtags.includes(hashtag);
	const newHashtags = isMuted
		? currentHashtags.filter((t) => t !== hashtag)
		: [...currentHashtags, hashtag];

	return createMuteTemplate(currentPubkeys, newHashtags, currentWords, currentEventIds);
}

// Toggle a word in the mute list
export function toggleMuteWord(
	currentKind10000: ParsedEvent | undefined,
	word: string
): { kind: number; created_at: number; tags: string[][]; content: string } {
	const currentPubkeys = currentKind10000 ? getMutedPubkeysFromEvent(currentKind10000) : [];
	const currentHashtags = currentKind10000 ? getMutedHashtagsFromEvent(currentKind10000) : [];
	const currentWords = currentKind10000 ? getMutedWordsFromEvent(currentKind10000) : [];
	const currentEventIds = currentKind10000 ? getMutedEventIdsFromEvent(currentKind10000) : [];

	const isMuted = currentWords.includes(word);
	const newWords = isMuted ? currentWords.filter((w) => w !== word) : [...currentWords, word];

	return createMuteTemplate(currentPubkeys, currentHashtags, newWords, currentEventIds);
}

// Toggle an event ID in the mute list
export function toggleMuteEventId(
	currentKind10000: ParsedEvent | undefined,
	eventId: string
): { kind: number; created_at: number; tags: string[][]; content: string } {
	const currentPubkeys = currentKind10000 ? getMutedPubkeysFromEvent(currentKind10000) : [];
	const currentHashtags = currentKind10000 ? getMutedHashtagsFromEvent(currentKind10000) : [];
	const currentWords = currentKind10000 ? getMutedWordsFromEvent(currentKind10000) : [];
	const currentEventIds = currentKind10000 ? getMutedEventIdsFromEvent(currentKind10000) : [];

	const isMuted = currentEventIds.includes(eventId);
	const newEventIds = isMuted
		? currentEventIds.filter((e) => e !== eventId)
		: [...currentEventIds, eventId];

	return createMuteTemplate(currentPubkeys, currentHashtags, currentWords, newEventIds);
}

// Helper functions to extract mute data from a ParsedEvent
function getMutedPubkeysFromEvent(event: ParsedEvent): string[] {
	const pubkeys = new Set<string>();

	// From content field
	try {
		const content = event.content()?.toString() || '[]';
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			parsed.forEach((p) => {
				if (typeof p === 'string') pubkeys.add(p);
			});
		}
	} catch (e) {
		// Invalid JSON, ignore
	}

	// From p tags
	const tags = event.tags() || [];
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag && tag[0] === 'p' && tag[1]) {
			pubkeys.add(tag[1] as string);
		}
	}

	return Array.from(pubkeys);
}

function getMutedHashtagsFromEvent(event: ParsedEvent): string[] {
	const hashtags: string[] = [];
	const tags = event.tags() || [];
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag && tag[0] === 't' && tag[1]) {
			hashtags.push(tag[1] as string);
		}
	}
	return hashtags;
}

function getMutedWordsFromEvent(event: ParsedEvent): string[] {
	const words: string[] = [];
	const tags = event.tags() || [];
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag && tag[0] === 'word' && tag[1]) {
			words.push(tag[1] as string);
		}
	}
	return words;
}

function getMutedEventIdsFromEvent(event: ParsedEvent): string[] {
	const eventIds: string[] = [];
	const tags = event.tags() || [];
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag && tag[0] === 'e' && tag[1]) {
			eventIds.push(tag[1] as string);
		}
	}
	return eventIds;
}
