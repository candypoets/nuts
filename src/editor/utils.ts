import _ from 'lodash';
import { nip19, nip10, type NostrEvent, type EventTemplate } from 'nostr-tools';
import { parse } from 'postcss';

export const contentTags = (text: string) => {
	// Initialize tag lists for each entity type
	const profileTags: string[][] = [];
	const eventTags: string[][] = [];
	const addrTags: string[][] = [];
	const hashtagTags: string[][] = [];

	// Process nostr:nprofile links
	// Process all entity types in a single regex pattern
	const pattern =
		/(nostr:naddr[a-zA-Z0-9:]+)|(nostr:nevent[a-zA-Z0-9:]+)|(nostr:nprofile[a-zA-Z0-9:]+)|(#(\w+))/g;

	text.replace(pattern, (match, naddr, nevent, nprofile, hashtag, tagValue) => {
		if (naddr) {
			const { data } = nip19.decode(naddr.replace('nostr:', ''));
			addrTags.push([
				'a',
				`${data.kind}:${data.pubkey}:${data.identifier}`,
				data.relays?.[0] || ''
			]);
		} else if (nevent) {
			const { data } = nip19.decode(nevent.replace('nostr:', ''));
			// Use 'q' tag for quotes (NIP-18) instead of 'e' tag
			eventTags.push(['q', data.id, data.relays?.[0] || '']);
		} else if (nprofile) {
			const { data } = nip19.decode(nprofile.replace('nostr:', ''));
			profileTags.push(['p', data.pubkey, data.relays?.[0] || '']);
		} else if (hashtag) {
			hashtagTags.push(['t', tagValue]);
		}
		return match;
	});

	return {
		addresses: addrTags,
		hashtags: hashtagTags,
		profiles: profileTags,
		events: eventTags
	};
};

// add the mentions, quotes, or profile in the content of the event to the tags
export const prepareEvent = (partialEvent: EventTemplate | NostrEvent): EventTemplate => {
	const refs = nip10.parse(partialEvent);
	const ctags = contentTags(partialEvent.content);

	// Preserve existing q tags from partialEvent (they have priority over parsed ones)
	const existingQTags = (partialEvent.tags || []).filter((t) => t[0] === 'q');
	const existingQIds = new Set(existingQTags.map((t) => t[1]));

	let eTags: string[][] = [];
	let qTags: string[][] = [...existingQTags]; // Start with existing q tags

	if (refs.root) {
		eTags.push(['e', refs.root.id, refs.root.relays?.[0] || '', 'root']);
	}
	if (refs.reply) {
		eTags.push(['e', refs.reply.id, refs.reply.relays?.[0] || '']);
	}
	for (let mention of refs.mentions) {
		eTags.push(['e', mention.id, mention.relays?.[0] || '']);
	}

	// Add q tags from content, but skip if we already have that event id from existing tags
	for (const qTag of ctags.events) {
		if (!existingQIds.has(qTag[1])) {
			qTags.push(qTag);
		}
	}

	if (partialEvent?.id) {
		// if there is an id before finalize(), it means we are using that event template to reply to it
		if (refs.root) {
			eTags.push(['e', partialEvent.id, '', 'reply']);
		} else {
			eTags = [['e', partialEvent.id, '', 'root'], ...eTags];
		}
	}

	let pTags: string[][] = [];

	for (let profile of refs.profiles) {
		pTags.push(['p', profile.pubkey, profile.relays?.[0] || '']);
	}

	pTags.push(...ctags.profiles);

	// Deduplicate e tags and q tags separately (they have different semantics)
	partialEvent.tags = [
		..._.uniqBy(eTags, (tag) => tag[1]),
		..._.uniqBy(qTags, (tag) => tag[1]),
		..._.uniqBy(pTags, (tag) => tag[1]),
		...ctags.addresses,
		...ctags.hashtags,
		['client', 'nutscash']
	];
	delete partialEvent.id;
	delete partialEvent.pubkey;
	delete partialEvent.parsed;
	delete partialEvent.requests;
	delete partialEvent.sig;
	delete partialEvent['Symbol(verified)'];

	return partialEvent;
};
