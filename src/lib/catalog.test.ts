import type { ParsedEvent } from '@candypoets/nipworker';
import { describe, expect, it } from 'vitest';

import {
	buildCatalogDefinitionTags,
	catalogAddress,
	catalogAvailability,
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
	catalogUsesQrFulfillment,
	isCatalogDefinition,
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
		kind: () => options.kind ?? 30402,
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
		expect(catalogAddress(event)).toBe(`30402:${pubkey}:flat-white`);
		expect(tags).toContainEqual(['title', 'Flat white']);
		expect(tags).toContainEqual(['price', '4.50', 'EUR']);
		expect(tags.some((tag) => tag[0] === 't')).toBe(false);
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
		// 30402 listings default to a single use; no max_uses tag is emitted.
		expect(catalogMaxUses(event)).toBe(1);
		expect(tags.some((tag) => tag[0] === 'max_uses')).toBe(false);
		expect(catalogEditable(event)).toBe(true);
	});

	it('defaults a 30402 listing to one use when the tag is omitted', () => {
		const event = stubEvent([
			['d', 'espresso'],
			['title', 'Espresso'],
			['price', '2.50', 'EUR'],
			['product_kind', 'drink']
		]);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(catalogMaxUses(event)).toBe(1);
	});

	it('treats other definition kinds without max_uses as unlimited', () => {
		const membership = stubEvent(
			[
				['d', 'supporter'],
				['t', 'membership'],
				['name', 'Supporter'],
				['price', '60', 'EUR', 'year']
			],
			{ kind: 30009 }
		);

		expect(catalogMaxUses(membership)).toBeUndefined();
	});

	it.each([
		[30402, 'food', undefined, true],
		[30402, 'drink', undefined, true],
		[30402, 'merchandise', undefined, false],
		[30402, 'generic', undefined, false],
		[30402, undefined, 10, true],
		[30009, undefined, undefined, true]
	] as const)(
		'sets QR fulfillment for kind %s product_kind %s max_uses %s to %s',
		(kind, productKind, maxUses, expected) => {
			const event = stubEvent(
				[
					...(productKind ? [['product_kind', productKind]] : []),
					...(maxUses ? [['max_uses', String(maxUses)]] : [])
				],
				{ kind }
			);

			expect(catalogUsesQrFulfillment(event)).toBe(expected);
		}
	);

	it('reads optional positive max uses on passes', () => {
		const tags = buildCatalogDefinitionTags({
			d: 'ten-visits',
			name: 'Ten visits',
			price: '90',
			currency: 'EUR',
			maxUses: 10
		});
		const event = stubEvent(tags);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(isStoreCatalogDefinition(event)).toBe(true);
		expect(tags).toContainEqual(['max_uses', '10']);
		expect(catalogMaxUses(event)).toBe(10);
		expect(catalogUsesQrFulfillment(event)).toBe(true);
	});

	it('recognizes event admission as read-only and reads its owning event', () => {
		const event = stubEvent([
			['d', 'event-summer-entrance'],
			['title', 'Summer entrance'],
			['price', '12', 'EUR'],
			['price_sats', '25000'],
			['a', `31923:${pubkey}:summer`],
			['max_uses', '1'],
			['availability', 'available'],
			['expiration', '1800000000']
		]);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(isStoreCatalogDefinition(event)).toBe(false);
		expect(catalogEditable(event)).toBe(false);
		expect(catalogEventAddress(event)).toBe(`31923:${pubkey}:summer`);
		expect(catalogMaxUses(event)).toBe(1);
		expect(catalogPriceSats(event)).toBe(25000);
		expect(catalogExpiration(event)).toBe(1800000000);
		expect(catalogAvailability(event)).toBe('available');
		expect(catalogPosition(event)).toBe(0);
	});

	it.each([30009, 31922, 31923])('rejects kind %s events as catalog definitions', (kind) => {
		expect(
			isCatalogDefinition(
				stubEvent(
					[
						['d', 'item'],
						['title', 'Item'],
						['price', '10', 'EUR']
					],
					{ kind }
				)
			)
		).toBe(false);
	});

	it('rejects invalid catalog fields', () => {
		const base = [
			['d', 'item'],
			['title', 'Item'],
			['price', '10', 'EUR']
		];
		for (const replacement of [
			['title', '  '],
			['price', '0', 'EUR'],
			['price', '10', 'EU'],
			['availability', 'deleted'],
			['position', '-1'],
			['product_kind', 'meal'],
			['max_uses', '0'],
			['max_uses', '1.5']
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
				d: 'free',
				name: 'Free',
				price: 0,
				currency: 'EUR'
			})
		).toThrow(/price/);
		expect(() =>
			buildCatalogDefinitionTags({
				d: 'bad-pass',
				name: 'Bad pass',
				price: 10,
				currency: 'EUR',
				maxUses: 1.5
			})
		).toThrow(/max uses/);
		expect(() =>
			buildCatalogDefinitionTags({
				d: 'bad-sats',
				name: 'Bad sats',
				price: 10,
				currency: 'EUR',
				priceSats: 1.5
			})
		).toThrow(/sats price/);
	});

	it('keeps an archived item a valid catalog definition', () => {
		const tags = buildCatalogDefinitionTags({
			d: 'archived-coffee',
			name: 'Archived coffee',
			price: 3,
			currency: 'EUR',
			availability: 'archived'
		});

		expect(tags).toContainEqual(['availability', 'archived']);
		expect(isCatalogDefinition(stubEvent(tags))).toBe(true);
		expect(catalogAvailability(stubEvent(tags))).toBe('archived');
	});

	it('accepts a catalog definition alongside unrelated topic tags', () => {
		const event = stubEvent([
			['d', 'espresso'],
			['t', 'coffee'],
			['title', 'Espresso'],
			['price', '2.50', 'EUR']
		]);

		expect(isCatalogDefinition(event)).toBe(true);
		expect(isStoreCatalogDefinition(event)).toBe(true);
	});

	it('does not accept a listing without a valid price tag', () => {
		const cases: string[][][] = [
			[],
			[['price']],
			[['price', '0', 'EUR']],
			[['price', '-5', 'EUR']]
		];
		for (const priceTags of cases) {
			const event = stubEvent([['d', 'espresso'], ['title', 'Espresso'], ...priceTags]);

			expect(isCatalogDefinition(event)).toBe(false);
			expect(isStoreCatalogDefinition(event)).toBe(false);
		}
	});
});

describe('upsertCatalogEvent', () => {
	function event(createdAt: number, eventId: string) {
		return stubEvent(
			buildCatalogDefinitionTags({
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
