import type { ParsedEvent } from '@candypoets/nipworker';
import { describe, expect, it } from 'vitest';

import {
	buildMembershipDefinitionTags,
	isSellablePriceTag,
	parseMembershipDefinition
} from './memberships';

const pubkey = '21317a0b4045a4ce330c9463ccbd6c63b5df5a67718e05adc1270853b2e47f0e';

function stubEvent(tags: string[][]): ParsedEvent {
	return {
		kind: () => 30009,
		id: () => 'definition-id',
		pubkey: () => pubkey,
		createdAt: () => 1778502625,
		tagsLength: () => tags.length,
		tags: (index: number) => ({
			itemsLength: () => tags[index].length,
			items: (item: number) => tags[index][item]
		})
	} as unknown as ParsedEvent;
}

describe('membership definition tags', () => {
	it('marks memberships with the membership topic and a NIP-99 price recurrence', () => {
		const tags = buildMembershipDefinitionTags({
			d: 'membership-supporter',
			name: 'Supporter',
			description: 'Supporter membership',
			price: '60',
			currency: 'EUR',
			billing: 'yearly'
		});

		expect(tags).toContainEqual(['t', 'membership']);
		expect(tags).toContainEqual(['price', '60', 'EUR', 'year']);
		expect(tags.some((tag) => tag[0] === 'stripe_account')).toBe(false);
		// NIP-97: sellability is the price tag itself - no marker or availability tags.
		expect(tags).not.toContainEqual(['t', 'sellable']);
		expect(tags.some((tag) => tag[0] === 'availability')).toBe(false);
		expect(tags.some((tag) => tag[0] === 'billing')).toBe(false);
	});

	it('round-trips billing and price through the parser', () => {
		const tags = buildMembershipDefinitionTags({
			d: 'membership-supporter',
			name: 'Supporter',
			description: 'Supporter membership',
			price: '60',
			currency: 'eur',
			billing: 'yearly'
		});

		expect(parseMembershipDefinition(stubEvent(tags))).toMatchObject({
			address: `30009:${pubkey}:membership-supporter`,
			d: 'membership-supporter',
			name: 'Supporter',
			price: '60',
			currency: 'EUR',
			billing: 'yearly'
		});
	});

	it.each([
		['monthly', 'month'],
		['yearly', 'year']
	] as const)('encodes %s billing as the price recurrence %s', (billing, recurrence) => {
		const tags = buildMembershipDefinitionTags({
			d: 'membership-dues',
			name: 'Dues',
			description: '',
			price: '15',
			currency: 'USD',
			billing
		});

		expect(tags).toContainEqual(['price', '15', 'USD', recurrence]);
		expect(parseMembershipDefinition(stubEvent(tags))?.billing).toBe(billing);
	});

	it('treats a price without recurrence as one-time', () => {
		const tags = buildMembershipDefinitionTags({
			d: 'membership-lifetime',
			name: 'Lifetime',
			description: '',
			price: '200',
			currency: 'EUR',
			billing: 'one_time'
		});

		expect(tags).toContainEqual(['price', '200', 'EUR']);
		expect(parseMembershipDefinition(stubEvent(tags))?.billing).toBe('one_time');
	});

	it('requires the membership topic', () => {
		expect(
			parseMembershipDefinition(
				stubEvent([
					['d', 'supporter'],
					['name', 'Supporter'],
					['price', '60', 'EUR', 'year']
				])
			)
		).toBeUndefined();
		expect(
			parseMembershipDefinition(
				stubEvent([
					['d', 'cook'],
					['t', 'role'],
					['name', 'Cook']
				])
			)
		).toBeUndefined();
	});

	it('is sellable exactly when the price tag is a valid positive amount', () => {
		expect(isSellablePriceTag(['price', '15', 'EUR'])).toBe(true);
		expect(isSellablePriceTag(['price', '15', 'EUR', 'month'])).toBe(true);
		expect(isSellablePriceTag(['price', '0.50', 'usd'])).toBe(false); // currency must be uppercase
		expect(isSellablePriceTag(['price', '0', 'EUR'])).toBe(false);
		expect(isSellablePriceTag(['price', '-5', 'EUR'])).toBe(false);
		expect(isSellablePriceTag(['price', '15', 'EU'])).toBe(false);
		expect(isSellablePriceTag(['price', '15'])).toBe(false);
		expect(isSellablePriceTag(undefined)).toBe(false);
	});
});
