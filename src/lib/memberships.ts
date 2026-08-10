import type { ParsedEvent } from '@candypoets/nipworker';
import { parsedEventTags } from 'src/lib/adminRelays';
import { roleAddress, roleDFromName } from 'src/lib/nip58Roles';

export type MembershipBilling = 'one_time' | 'monthly' | 'yearly';

export type MembershipDefinition = {
	address: string;
	pubkey: string;
	d: string;
	name: string;
	description: string;
	image: string;
	price: string;
	currency: string;
	billing: MembershipBilling;
	createdAt: number;
};

/** NIP-99 price recurrence: month/year make a membership billed. */
function billingFromPriceTag(priceTag: string[] | undefined): MembershipBilling {
	if (priceTag?.[3] === 'month') return 'monthly';
	if (priceTag?.[3] === 'year') return 'yearly';
	return 'one_time';
}

/** A membership is sellable when it carries a valid NIP-99 price tag. */
export function isSellablePriceTag(priceTag: string[] | undefined) {
	return Boolean(
		priceTag?.[1] &&
		/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(priceTag[1]) &&
		Number(priceTag[1]) > 0 &&
		/^[A-Z]{3}$/.test(priceTag[2] || '')
	);
}

export function parseMembershipDefinition(event: ParsedEvent): MembershipDefinition | undefined {
	if (event.kind() !== 30009) return undefined;
	const tags = parsedEventTags(event);
	if (!tags.some((tag) => tag[0] === 't' && tag[1] === 'membership')) return undefined;
	const d = tags.find((tag) => tag[0] === 'd')?.[1];
	const pubkey = event.pubkey();
	if (!d || !pubkey) return undefined;
	const priceTag = tags.find((tag) => tag[0] === 'price');
	return {
		address: roleAddress(pubkey, d),
		pubkey,
		d,
		name: tags.find((tag) => tag[0] === 'name')?.[1] || d,
		description: tags.find((tag) => tag[0] === 'description')?.[1] || '',
		image: tags.find((tag) => tag[0] === 'image')?.[1] || '',
		price: priceTag?.[1] || '',
		currency: (priceTag?.[2] || 'EUR').toUpperCase(),
		billing: billingFromPriceTag(priceTag),
		createdAt: Number(event.createdAt())
	};
}

export function membershipDFromName(name: string) {
	const d = roleDFromName(name);
	return d ? `membership-${d}` : '';
}

export function buildMembershipDefinitionTags(membership: {
	d: string;
	name: string;
	description: string;
	image?: string;
	price: string;
	currency: string;
	billing: MembershipDefinition['billing'];
}) {
	const tags = [
		['d', membership.d],
		['t', 'membership'],
		['name', membership.name],
		['description', membership.description]
	];
	const price = membership.price.trim();
	if (price) {
		const recurrence =
			membership.billing === 'monthly' ? 'month' : membership.billing === 'yearly' ? 'year' : '';
		tags.push(
			recurrence
				? ['price', price, membership.currency.toUpperCase(), recurrence]
				: ['price', price, membership.currency.toUpperCase()]
		);
	}
	if (membership.image?.trim()) tags.push(['image', membership.image.trim()]);
	return tags;
}
