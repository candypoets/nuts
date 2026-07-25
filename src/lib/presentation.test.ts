import { finalizeEvent } from 'nostr-tools';
import { describe, expect, it } from 'vitest';

import {
	decodeEntitlementPresentation,
	encodePresentation,
	entitlementPresentationTemplate,
	verifyEntitlementPresentation
} from './presentation';

const secretKey = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1));
const author = '4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa';
const awardId = 'a'.repeat(64);
const badgeAddress = `30009:${author}:flat-white`;
const community = 'wss://community.example';

function signedPresentation(input: { orderId?: string; eventAddress?: string }) {
	return finalizeEvent(
		entitlementPresentationTemplate({ awardId, badgeAddress, community, ...input }, 1_800_000_000),
		secretKey
	);
}

describe('entitlement presentations', () => {
	it('round-trips a signed store order presentation', () => {
		const event = signedPresentation({ orderId: 'cs_order_123' });
		const decoded = decodeEntitlementPresentation(encodePresentation(event));

		expect(decoded).toMatchObject({
			awardId,
			badgeAddress,
			community,
			orderId: 'cs_order_123'
		});
		expect(decoded && verifyEntitlementPresentation(decoded, 1_800_000_030)).toBe(true);
	});

	it('round-trips a signed event admission presentation', () => {
		const eventAddress = `31923:${author}:summer-night`;
		const event = signedPresentation({ eventAddress });
		const decoded = decodeEntitlementPresentation(encodePresentation(event));

		expect(decoded?.eventAddress).toBe(eventAddress);
		expect(decoded && verifyEntitlementPresentation(decoded, 1_800_000_030)).toBe(true);
	});

	it('requires exactly one fulfillment context', () => {
		expect(() =>
			entitlementPresentationTemplate({
				awardId,
				badgeAddress,
				community
			})
		).toThrow(/one fulfillment context/);
		expect(() =>
			entitlementPresentationTemplate({
				awardId,
				badgeAddress,
				community,
				orderId: 'order-1',
				eventAddress: `31923:${author}:summer-night`
			})
		).toThrow(/one fulfillment context/);
	});

	it('rejects expired presentations', () => {
		const event = signedPresentation({ orderId: 'order-1' });
		const decoded = decodeEntitlementPresentation(encodePresentation(event));

		expect(decoded && verifyEntitlementPresentation(decoded, 1_800_000_091)).toBe(false);
	});
});
