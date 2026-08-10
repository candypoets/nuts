import { definitionAddress } from 'src/lib/nip97';

export type PaidEventAccessInput = {
	eventKind: 31922 | 31923;
	eventAuthor: string;
	eventD: string;
	eventTitle: string;
	eventImage?: string;
	price: string | number;
	currency: string;
	priceSats?: number;
	expiresAt: number;
	relay?: string;
};

export function buildPaidEventAccess(input: PaidEventAccessInput) {
	const eventAuthor = input.eventAuthor.trim();
	const eventD = input.eventD.trim();
	const eventTitle = input.eventTitle.trim();
	const price = String(input.price).trim();
	const currency = input.currency.trim().toUpperCase();
	if (!eventAuthor || !eventD || !eventTitle) {
		throw new Error('Paid event access requires an event author, identifier, and title');
	}
	if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(price) || Number(price) <= 0) {
		throw new Error('Event entrance price must be a positive decimal');
	}
	if (!/^[A-Z]{3}$/.test(currency)) {
		throw new Error('Event entrance currency must be a three-letter code');
	}
	if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) {
		throw new Error('Event entrance expiration must be a positive timestamp');
	}
	if (
		input.priceSats !== undefined &&
		(!Number.isSafeInteger(input.priceSats) || input.priceSats <= 0)
	) {
		throw new Error('Event entrance sats price must be a positive integer');
	}

	const eventAddress = `${input.eventKind}:${eventAuthor}:${eventD}`;
	const badgeD = `event-${eventD}-entrance`;
	const badgeAddress = definitionAddress(30402, eventAuthor, badgeD);
	const eventTags: string[][] = [
		['entrance_badge', badgeAddress],
		['entrance_price', price, currency]
	];
	if (input.priceSats !== undefined) {
		eventTags.push(['entrance_sats', String(input.priceSats)]);
	}

	const description = `Paid entrance for ${eventTitle}`;
	const definitionTags: string[][] = [
		['d', badgeD],
		['title', `${eventTitle} entrance`],
		['description', description],
		['a', eventAddress],
		['price', price, currency],
		['max_uses', '1'],
		['availability', 'available'],
		['expiration', String(input.expiresAt)]
	];
	const image = input.eventImage?.trim();
	const relay = input.relay?.trim();
	if (input.priceSats !== undefined) {
		definitionTags.push(['price_sats', String(input.priceSats)]);
	}
	if (image) definitionTags.push(['image', image]);
	if (relay) definitionTags.push(['r', relay]);

	return {
		eventAddress,
		badgeD,
		badgeAddress,
		description,
		eventTags,
		definitionTags
	};
}
