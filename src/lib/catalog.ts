import type { ParsedEvent } from '@candypoets/nipworker';
import { extractTagValue } from '@candypoets/nipworker';
import { definitionAddress } from 'src/lib/nip97';

export const CATALOG_DEFINITION_KIND = 30402;

export const CATALOG_AVAILABILITIES = ['available', 'unavailable', 'archived'] as const;
export const PRODUCT_KINDS = ['food', 'drink', 'merchandise', 'generic'] as const;

export type CatalogAvailability = (typeof CATALOG_AVAILABILITIES)[number];
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export type CatalogDefinitionInput = {
	d: string;
	name: string;
	description?: string;
	image?: string;
	price: string | number;
	currency: string;
	priceSats?: number;
	section?: string;
	position?: number;
	availability?: CatalogAvailability;
	productKind?: ProductKind;
	/** Uses per award; absent defaults to one (NIP-97 30402 rule). */
	maxUses?: number;
};

function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
	return typeof value === 'string' && values.includes(value as T);
}

function positiveDecimal(value: string | undefined) {
	if (!value || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return undefined;
	return Number(value) > 0 ? value : undefined;
}

function currencyCode(value: string | undefined) {
	const normalized = value?.trim().toUpperCase();
	return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
}

function nonNegativeInteger(value: string | undefined, fallback: number) {
	if (value === undefined) return fallback;
	if (!/^(?:0|[1-9]\d*)$/.test(value)) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function positiveInteger(value: string | undefined) {
	if (value === undefined) return undefined;
	if (!/^[1-9]\d*$/.test(value)) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function requireText(value: string, field: string) {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${field} is required`);
	return normalized;
}

export function catalogDefinitionAddress(pubkey: string, d: string) {
	return definitionAddress(CATALOG_DEFINITION_KIND, pubkey, d);
}

export function sellableCatalogSubscriptionId(relay: string) {
	return `store_sellable_catalog_v2_${relay}`;
}

export function catalogDFromName(name: string) {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Catalog events stay as FlatBuffer views. These accessors materialize only the
 * individual string requested by the caller; they never project an event into a DTO.
 */
export function catalogD(event: ParsedEvent) {
	return extractTagValue(event, 'd')?.trim() || '';
}

export function catalogAddress(event: ParsedEvent) {
	const pubkey = event.pubkey();
	const d = catalogD(event);
	return pubkey && d ? catalogDefinitionAddress(pubkey, d) : '';
}

export function catalogName(event: ParsedEvent) {
	return extractTagValue(event, 'title')?.trim() || catalogD(event);
}

export function catalogDescription(event: ParsedEvent) {
	return extractTagValue(event, 'description')?.trim() || '';
}

export function catalogImage(event: ParsedEvent) {
	return extractTagValue(event, 'image')?.trim() || '';
}

export function catalogPrice(event: ParsedEvent) {
	return positiveDecimal(extractTagValue(event, 'price')?.trim()) || '';
}

export function catalogCurrency(event: ParsedEvent) {
	return currencyCode(extractTagValue(event, 'price', 2)) || '';
}

export function catalogSection(event: ParsedEvent) {
	return extractTagValue(event, 'section')?.trim() || '';
}

export function catalogPosition(event: ParsedEvent) {
	return nonNegativeInteger(extractTagValue(event, 'position'), 0) ?? 0;
}

export function catalogAvailability(event: ParsedEvent): CatalogAvailability | undefined {
	const value = extractTagValue(event, 'availability');
	if (value === undefined) return 'available';
	return includesValue(CATALOG_AVAILABILITIES, value) ? value : undefined;
}

export function catalogProductKind(event: ParsedEvent): ProductKind | undefined {
	const value = extractTagValue(event, 'product_kind');
	if (value === undefined) return 'generic';
	return includesValue(PRODUCT_KINDS, value) ? value : undefined;
}

/** QR fulfillment: food/drink counter items, multi-use passes, unlimited memberships. */
export function catalogUsesQrFulfillment(event: ParsedEvent) {
	const productKind = catalogProductKind(event);
	if (productKind === 'food' || productKind === 'drink') return true;
	const maxUses = catalogMaxUses(event);
	return maxUses === undefined || maxUses > 1;
}

/**
 * Uses per award; `undefined` means unlimited. 30402 listings default to one
 * when `max_uses` is absent (NIP-97); other definition kinds are unlimited.
 */
export function catalogMaxUses(event: ParsedEvent) {
	const maxUses = positiveInteger(extractTagValue(event, 'max_uses'));
	if (maxUses) return maxUses;
	return event.kind() === CATALOG_DEFINITION_KIND ? 1 : undefined;
}

export function catalogPriceSats(event: ParsedEvent) {
	return positiveInteger(extractTagValue(event, 'price_sats'));
}

export function catalogExpiration(event: ParsedEvent) {
	return positiveInteger(extractTagValue(event, 'expiration'));
}

/** Linked calendar event address; present on tickets. */
export function catalogEventAddress(event: ParsedEvent) {
	return extractTagValue(event, 'a') || '';
}

/** Tickets are managed with their event, not in the store catalog. */
export function catalogEditable(event: ParsedEvent) {
	return !catalogEventAddress(event);
}

export function isCatalogDefinition(event: ParsedEvent) {
	if (
		event.kind() !== CATALOG_DEFINITION_KIND ||
		!event.pubkey() ||
		!event.id() ||
		!catalogD(event)
	) {
		return false;
	}
	if (
		!extractTagValue(event, 'title')?.trim() ||
		!catalogPrice(event) ||
		!catalogCurrency(event) ||
		!catalogAvailability(event)
	) {
		return false;
	}
	const rawPosition = extractTagValue(event, 'position');
	if (rawPosition !== undefined && nonNegativeInteger(rawPosition, 0) === undefined) return false;
	const rawPriceSats = extractTagValue(event, 'price_sats');
	if (rawPriceSats !== undefined && positiveInteger(rawPriceSats) === undefined) return false;
	const rawMaxUses = extractTagValue(event, 'max_uses');
	if (rawMaxUses !== undefined && positiveInteger(rawMaxUses) === undefined) return false;
	if (!catalogProductKind(event)) return false;
	return true;
}

export function isStoreCatalogDefinition(event: ParsedEvent) {
	return isCatalogDefinition(event) && !catalogEventAddress(event);
}

export function isNewerCatalogEvent(candidate: ParsedEvent, current: ParsedEvent) {
	return (
		candidate.createdAt() > current.createdAt() ||
		(candidate.createdAt() === current.createdAt() &&
			(candidate.id() || '').localeCompare(current.id() || '') < 0)
	);
}

/**
 * The returned array is a list of FlatBuffer view references. No event fields or
 * tag trees are copied.
 */
export function upsertCatalogEvent(events: ParsedEvent[], candidate: ParsedEvent) {
	if (!isCatalogDefinition(candidate)) return events;
	const address = catalogAddress(candidate);
	const existingIndex = events.findIndex((event) => catalogAddress(event) === address);
	if (existingIndex === -1) return [...events, candidate];
	if (!isNewerCatalogEvent(candidate, events[existingIndex])) return events;
	return events.map((event, index) => (index === existingIndex ? candidate : event));
}

export function buildCatalogDefinitionTags(definition: CatalogDefinitionInput): string[][] {
	const d = requireText(definition.d, 'd');
	const name = requireText(definition.name, 'name');
	const price = positiveDecimal(String(definition.price).trim());
	const currency = currencyCode(definition.currency);
	const priceSats =
		definition.priceSats === undefined ? undefined : positiveInteger(String(definition.priceSats));
	const availability = definition.availability ?? 'available';
	const position = definition.position ?? 0;

	if (!price) throw new Error('price must be a positive decimal');
	if (!currency) throw new Error('currency must be a three-letter code');
	if (definition.priceSats !== undefined && !priceSats) {
		throw new Error('sats price must be a positive integer');
	}
	if (!includesValue(CATALOG_AVAILABILITIES, availability)) {
		throw new Error('availability is invalid');
	}
	if (!Number.isSafeInteger(position) || position < 0) {
		throw new Error('position must be a non-negative integer');
	}
	if (
		definition.maxUses !== undefined &&
		(!Number.isSafeInteger(definition.maxUses) || definition.maxUses <= 0)
	) {
		throw new Error('max uses must be a positive integer');
	}
	const productKind = definition.productKind ?? 'generic';
	if (!includesValue(PRODUCT_KINDS, productKind)) throw new Error('product kind is invalid');

	const tags: string[][] = [
		['d', d],
		['title', name],
		['description', definition.description?.trim() || ''],
		['price', price, currency],
		['position', String(position)],
		['availability', availability],
		['product_kind', productKind]
	];
	const image = definition.image?.trim();
	const section = definition.section?.trim();
	if (priceSats) tags.push(['price_sats', String(priceSats)]);
	if (image) tags.push(['image', image]);
	if (section) tags.push(['section', section]);
	if (definition.maxUses !== undefined && definition.maxUses > 1) {
		tags.push(['max_uses', String(definition.maxUses)]);
	}

	return tags;
}
