import type { ParsedEvent } from '@candypoets/nipworker';
import { parsedEventTags } from 'src/lib/adminRelays';
import {
	DEFAULT_COMMUNITY_TYPE,
	isCommunityType,
	type CommunityType
} from 'src/lib/communityTypes';

/**
 * Community profile: an addressable app-data event (NIP-78, kind 30078) published
 * by an admin to the community relay only. It carries the community archetype and
 * the metadata the coordinator/NIP-11 does not store (description, image, and the
 * hospitality booking/menu links). See tasks/prd-community-archetypes.md.
 */
export const COMMUNITY_PROFILE_KIND = 30078;
export const COMMUNITY_PROFILE_D = 'nuts-community-profile';

export type CommunityProfile = {
	pubkey: string;
	type: CommunityType;
	description: string;
	image: string;
	menuUrl: string;
	bookingUrl: string;
	createdAt: number;
};

function httpUrl(value: string | undefined) {
	return value && /^https?:\/\//.test(value) ? value : '';
}

export function parseCommunityProfile(event: ParsedEvent): CommunityProfile | undefined {
	if (event.kind() !== COMMUNITY_PROFILE_KIND) return undefined;
	const tags = parsedEventTags(event);
	const d = tags.find((tag) => tag[0] === 'd')?.[1];
	if (d !== COMMUNITY_PROFILE_D) return undefined;
	const pubkey = event.pubkey();
	if (!pubkey) return undefined;

	const typeValue = tags.find((tag) => tag[0] === 'type')?.[1];
	return {
		pubkey,
		type: isCommunityType(typeValue) ? typeValue : DEFAULT_COMMUNITY_TYPE,
		description: tags.find((tag) => tag[0] === 'description')?.[1] || '',
		image: httpUrl(tags.find((tag) => tag[0] === 'image')?.[1]),
		menuUrl: httpUrl(tags.find((tag) => tag[0] === 'menu_url')?.[1]),
		bookingUrl: httpUrl(tags.find((tag) => tag[0] === 'booking_url')?.[1]),
		createdAt: Number(event.createdAt())
	};
}

export function buildCommunityProfileTags(profile: {
	type: CommunityType;
	description?: string;
	image?: string;
	menuUrl?: string;
	bookingUrl?: string;
}) {
	const tags = [
		['d', COMMUNITY_PROFILE_D],
		['type', profile.type],
		['description', profile.description?.trim() || '']
	];
	const image = httpUrl(profile.image?.trim());
	const menuUrl = httpUrl(profile.menuUrl?.trim());
	const bookingUrl = httpUrl(profile.bookingUrl?.trim());
	if (image) tags.push(['image', image]);
	if (menuUrl) tags.push(['menu_url', menuUrl]);
	if (bookingUrl) tags.push(['booking_url', bookingUrl]);
	return tags;
}
