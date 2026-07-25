import type { ParsedEvent } from '@candypoets/nipworker';
import { describe, expect, it } from 'vitest';

import {
	BADGE_DEFINITION_TYPE_TOPICS,
	buildCatalogDefinitionTags,
	CATALOG_SELLABLE_TAG,
	catalogAddress,
	catalogAvailability,
	catalogBilling,
	catalogCurrency,
	catalogDefinitionAddress,
	catalogDescription,
	catalogEditable,
	catalogEventAddress,
	catalogExpiration,
	catalogImage,
	catalogMaxUses,
	catalogName,
	catalogPosition,
	catalogPrice,
	catalogPriceSats,
	catalogProductKind,
	catalogSection,
	catalogSellable,
	catalogStripeAccountId,
	catalogType,
	catalogUsesQrFulfillment,
	isCatalogDefinition,
	isSellableEventAccessDefinition,
	isSellableCatalogDefinition,
	isStoreCatalogDefinition,
	sellableCatalogSubscriptionId,
	upsertCatalogEvent
} from './catalog';

const pubkey = '21317a0b4045a4ce330c9463ccbd6c63b5df5a67718e05adc1270853b2e47f0e';

function stubEvent(
	tags: string[][],
	options: { kind?: number; id?: string; pubkey?: string; createdAt?: number } = {}
): ParsedEvent {
	return {
		kind: () => options.kind ?? 30009,
		id: () => options.id ?? 'event-id',
		pubkey: () => options.pubkey ?? pubkey,
		createdAt: () => options.createdAt ?? 1778502625,
		tagsLength: () => tags.length,
		tags: (index: number) => ({
			itemsLength: () => tags[index].length,
			items: (item: number) => tags[index][item]
		})
	} as unknown as ParsedEvent;
}

describe('catalog FlatBuffer accessors', () => {
	it('scopes the shared store subscription to the community relay', () => {
		expect(sellableCatalogSubscriptionId('wss://community.example')).toBe(
			'store_sellable_catalog_v2_wss://community.example'
		);
		expect(sellableCatalogSubscriptionId('wss://other.example')).not.toBe(
			sellableCatalogSubscriptionId('wss://community.example')
		);
	});

	it('reads a product directly from the event view', () => {
		const tags = buildCatalogDefinitionTags({
			type: 'product',
			d: 'flat-white',
			name: ' Flat white ',
			description: ' Double shot ',
			image: ' https://cdn.example/coffee.jpg ',
			price: '4.50',
			currency: 'eur',
			priceSats: 8_500,
			section: ' Coffee ',
			position: 2,
			availability: 'unavailable',
			productKind: 'drink'
		});
		const event = stubEvent(tags);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(catalogAddress(event)).toBe(catalogDefinitionAddress(pubkey, 'flat-white'));
		expect(catalogType(event)).toBe('product');
		expect(catalogSellable(event)).toBe(true);
		expect(tags).toContainEqual(['t', BADGE_DEFINITION_TYPE_TOPICS.product]);
		expect(tags).toContainEqual(['t', CATALOG_SELLABLE_TAG]);
		expect(catalogName(event)).toBe('Flat white');
		expect(catalogDescription(event)).toBe('Double shot');
		expect(catalogImage(event)).toBe('https://cdn.example/coffee.jpg');
		expect(catalogPrice(event)).toBe('4.50');
		expect(catalogCurrency(event)).toBe('EUR');
		expect(catalogPriceSats(event)).toBe(8_500);
		expect(tags).toContainEqual(['price_sats', '8500']);
		expect(catalogSection(event)).toBe('Coffee');
		expect(catalogPosition(event)).toBe(2);
		expect(catalogAvailability(event)).toBe('unavailable');
		expect(catalogProductKind(event)).toBe('drink');
		expect(catalogMaxUses(event)).toBe(1);
		expect(tags).toContainEqual(['max_uses', '1']);
		expect(catalogEditable(event)).toBe(true);
	});

	it('defaults a product definition to one use when the tag is omitted', () => {
		const event = stubEvent([
			['d', 'espresso'],
			['type', 'product'],
			['t', BADGE_DEFINITION_TYPE_TOPICS.product],
			['t', CATALOG_SELLABLE_TAG],
			['name', 'Espresso'],
			['price', '2.50', 'EUR'],
			['product_kind', 'drink']
		]);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(catalogMaxUses(event)).toBe(1);
	});

	it.each([
		['product', 'food', true],
		['product', 'drink', true],
		['product', 'merchandise', false],
		['product', 'generic', false],
		['event_access', undefined, true],
		['pass', undefined, true],
		['membership', undefined, true]
	] as const)('sets QR fulfillment for %s %s to %s', (type, productKind, expected) => {
		const event = stubEvent([
			['type', type],
			...(productKind ? [['product_kind', productKind]] : [])
		]);

		expect(catalogUsesQrFulfillment(event)).toBe(expected);
	});

	it('reads membership billing and Stripe metadata without projecting a DTO', () => {
		const tags = buildCatalogDefinitionTags({
			type: 'membership',
			d: 'supporter',
			name: 'Supporter',
			price: 60,
			currency: 'usd',
			billing: 'yearly',
			stripeAccountId: 'acct_123'
		});
		const event = stubEvent(tags);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(isSellableCatalogDefinition(event)).toBe(true);
		expect(catalogType(event)).toBe('membership');
		expect(tags).toContainEqual(['t', BADGE_DEFINITION_TYPE_TOPICS.membership]);
		expect(tags).toContainEqual(['t', CATALOG_SELLABLE_TAG]);
		expect(catalogBilling(event)).toBe('yearly');
		expect(catalogStripeAccountId(event)).toBe('acct_123');
	});

	it('rejects usage limits on memberships', () => {
		const tags = buildCatalogDefinitionTags({
			type: 'membership',
			d: 'supporter',
			name: 'Supporter',
			price: 60,
			currency: 'EUR',
			billing: 'yearly'
		});

		expect(isCatalogDefinition(stubEvent([...tags, ['max_uses', '12']]))).toBe(false);
	});

	it('reads optional positive max uses on passes', () => {
		const tags = buildCatalogDefinitionTags({
			type: 'pass',
			d: 'ten-visits',
			name: 'Ten visits',
			price: '90',
			currency: 'EUR',
			maxUses: 10
		});
		const event = stubEvent(tags);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(isSellableCatalogDefinition(event)).toBe(true);
		expect(catalogType(event)).toBe('pass');
		expect(tags).toContainEqual(['t', BADGE_DEFINITION_TYPE_TOPICS.pass]);
		expect(tags).toContainEqual(['t', CATALOG_SELLABLE_TAG]);
		expect(catalogMaxUses(event)).toBe(10);
	});

	it('recognizes event admission as read-only and reads its owning event', () => {
		const event = stubEvent([
			['d', 'event-summer-entrance'],
			['type', 'event_access'],
			['t', BADGE_DEFINITION_TYPE_TOPICS.event_access],
			['t', CATALOG_SELLABLE_TAG],
			['name', 'Summer entrance'],
			['price', '12', 'EUR'],
			['price_sats', '25000'],
			['a', `31923:${pubkey}:summer`],
			['max_uses', '1'],
			['availability', 'available'],
			['expiration', '1800000000']
		]);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(isSellableCatalogDefinition(event)).toBe(true);
		expect(isSellableEventAccessDefinition(event)).toBe(true);
		expect(isStoreCatalogDefinition(event)).toBe(false);
		expect(catalogType(event)).toBe('event_access');
		expect(catalogSellable(event)).toBe(true);
		expect(catalogEditable(event)).toBe(false);
		expect(catalogEventAddress(event)).toBe(`31923:${pubkey}:summer`);
		expect(catalogMaxUses(event)).toBe(1);
		expect(catalogPriceSats(event)).toBe(25000);
		expect(catalogExpiration(event)).toBe(1800000000);
		expect(catalogAvailability(event)).toBe('available');
		expect(catalogPosition(event)).toBe(0);
	});

	it.each(['role', '', 'unknown'])('rejects non-catalog type %s', (type) => {
		expect(
			isCatalogDefinition(
				stubEvent([
					['d', 'admin'],
					...(type ? [['type', type]] : []),
					['name', 'Admin'],
					['price', '10', 'EUR']
				])
			)
		).toBe(false);
	});

	it('rejects invalid catalog fields', () => {
		const base = [
			['d', 'item'],
			['type', 'product'],
			['t', BADGE_DEFINITION_TYPE_TOPICS.product],
			['t', CATALOG_SELLABLE_TAG],
			['name', 'Item'],
			['price', '10', 'EUR'],
			['max_uses', '1']
		];
		for (const replacement of [
			['price', '0', 'EUR'],
			['price', '10', 'EU'],
			['availability', 'deleted'],
			['position', '-1'],
			['product_kind', 'meal'],
			['max_uses', '2']
		]) {
			expect(
				isCatalogDefinition(
					stubEvent([...base.filter((tag) => tag[0] !== replacement[0]), replacement])
				)
			).toBe(false);
		}
	});

	it('rejects invalid builder inputs', () => {
		expect(() =>
			buildCatalogDefinitionTags({
				type: 'product',
				d: 'free',
				name: 'Free',
				price: 0,
				currency: 'EUR'
			})
		).toThrow(/price/);
		expect(() =>
			buildCatalogDefinitionTags({
				type: 'pass',
				d: 'bad-pass',
				name: 'Bad pass',
				price: 10,
				currency: 'EUR',
				maxUses: 1.5
			})
		).toThrow(/max uses/);
		expect(() =>
			buildCatalogDefinitionTags({
				type: 'product',
				d: 'bad-sats',
				name: 'Bad sats',
				price: 10,
				currency: 'EUR',
				priceSats: 1.5
			})
		).toThrow(/sats price/);
	});

	it('keeps the sellable marker when an item is archived', () => {
		const tags = buildCatalogDefinitionTags({
			type: 'product',
			d: 'archived-coffee',
			name: 'Archived coffee',
			price: 3,
			currency: 'EUR',
			availability: 'archived'
		});

		expect(tags).toContainEqual(['t', CATALOG_SELLABLE_TAG]);
		expect(tags).toContainEqual(['t', BADGE_DEFINITION_TYPE_TOPICS.product]);
		expect(catalogSellable(stubEvent(tags))).toBe(true);
		expect(catalogAvailability(stubEvent(tags))).toBe('archived');
	});

	it('finds the sellable marker after another topic tag', () => {
		const event = stubEvent([
			['d', 'espresso'],
			['type', 'product'],
			['t', 'coffee'],
			['t', BADGE_DEFINITION_TYPE_TOPICS.product],
			['t', CATALOG_SELLABLE_TAG],
			['name', 'Espresso'],
			['price', '2.50', 'EUR'],
			['max_uses', '1']
		]);

		expect(catalogSellable(event)).toBe(true);
		expect(isSellableCatalogDefinition(event)).toBe(true);
	});

	it('does not accept an unmarked catalog definition as sellable', () => {
		const event = stubEvent([
			['d', 'espresso'],
			['type', 'product'],
			['t', BADGE_DEFINITION_TYPE_TOPICS.product],
			['name', 'Espresso'],
			['price', '2.50', 'EUR'],
			['max_uses', '1']
		]);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(isSellableCatalogDefinition(event)).toBe(false);
		expect(isStoreCatalogDefinition(event)).toBe(false);
	});
});

describe('upsertCatalogEvent', () => {
	function event(createdAt: number, eventId: string) {
		return stubEvent(
			buildCatalogDefinitionTags({
				type: 'product',
				d: 'coffee',
				name: 'Coffee',
				price: 3,
				currency: 'EUR'
			}),
			{ createdAt, id: eventId }
		);
	}

	it('keeps FlatBuffer views and replaces only with a newer addressable event', () => {
		const old = event(10, 'a');
		const newer = event(11, 'b');
		const tiedButLower = event(11, 'a');
		const tiedButHigher = event(11, 'c');

		expect(upsertCatalogEvent([old], newer)).toEqual([newer]);
		expect(upsertCatalogEvent([newer], tiedButLower)).toEqual([tiedButLower]);
		expect(upsertCatalogEvent([newer], tiedButHigher)).toEqual([newer]);
		expect(upsertCatalogEvent([], old)[0]).toBe(old);
	});
});
