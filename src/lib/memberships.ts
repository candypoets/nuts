import type { ParsedEvent } from '@candypoets/nipworker';
import { parsedEventTags } from 'src/lib/adminRelays';
import { roleAddress, roleDFromName } from 'src/lib/nip58Roles';

export type MembershipDefinition = {
	address: string;
	pubkey: string;
	d: string;
	name: string;
	description: string;
	image: string;
	price: string;
	currency: string;
	billing: 'one_time' | 'monthly' | 'yearly';
	stripeAccountId: string;
	createdAt: number;
};

export function parseMembershipDefinition(event: ParsedEvent): MembershipDefinition | undefined {
	if (event.kind() !== 30009) return undefined;
	const tags = parsedEventTags(event);
	if (tags.find((tag) => tag[0] === 'type')?.[1] !== 'membership') return undefined;
	const d = tags.find((tag) => tag[0] === 'd')?.[1];
	const pubkey = event.pubkey();
	if (!d || !pubkey) return undefined;
	const priceTag = tags.find((tag) => tag[0] === 'price');
	const billingValue = tags.find((tag) => tag[0] === 'billing')?.[1];
	const billing =
		billingValue === 'monthly' || billingValue === 'yearly' ? billingValue : 'one_time';
	return {
		address: roleAddress(pubkey, d),
		pubkey,
		d,
		name: tags.find((tag) => tag[0] === 'name')?.[1] || d,
		description: tags.find((tag) => tag[0] === 'description')?.[1] || '',
		image: tags.find((tag) => tag[0] === 'image')?.[1] || '',
		price: priceTag?.[1] || '',
		currency: (priceTag?.[2] || 'EUR').toUpperCase(),
		billing,
		stripeAccountId: tags.find((tag) => tag[0] === 'stripe_account')?.[1] || '',
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
	stripeAccountId: string;
}) {
	const tags = [
		['d', membership.d],
		['name', membership.name],
		['description', membership.description],
		['type', 'membership'],
		['price', membership.price, membership.currency.toUpperCase()],
		['billing', membership.billing],
		['stripe_account', membership.stripeAccountId]
	];
	if (membership.image?.trim()) tags.push(['image', membership.image.trim()]);
	return tags;
}
