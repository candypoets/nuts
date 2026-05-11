import { describe, expect, it } from 'vitest';

import { buildZapRequestTemplate } from './wallet';

const pubkey = '21317a0b4045a4ce330c9463ccbd6c63b5df5a67718e05adc1270853b2e47f0e';
const noteId = '000038eb385917566d3304983d7f4501c0da657b7f6114b698e2177f507b290a';
const lnurl = 'https://rizful.com/.well-known/lnurlp/qnemo';

describe('buildZapRequestTemplate', () => {
	it('builds a NIP-57 zap request template with amount, lnurl, event, and relays tags', () => {
		const template = buildZapRequestTemplate({
			pubkey,
			amount: 21,
			lnurl,
			relays: ['wss://relay.nuts.cash', ' wss://nos.lol '],
			content: 'nice note',
			noteId,
			createdAt: 1778502625
		});

		expect(template.kind).toBe(9734);
		expect(template.content).toBe('nice note');
		expect(template.created_at).toBe(1778502625);
		expect(template.tags).toContainEqual(['p', pubkey]);
		expect(template.tags).toContainEqual(['amount', '21000']);
		expect(template.tags).toContainEqual(['e', noteId]);
		expect(template.tags).toContainEqual(['relays', 'wss://relay.nuts.cash', 'wss://nos.lol']);

		const lnurlTag = template.tags.find((tag) => tag[0] === 'lnurl');
		expect(lnurlTag?.[1]).toMatch(/^lnurl/);
	});

	it('preserves an existing bech32 lnurl tag value', () => {
		const bech32Lnurl = 'lnurl1dp68gurn8ghj7unf0fn82mpwvdhk6tewwajkcmpdddhx7amw9akxuatjd3cz7utwv4kk75v46cg';
		const template = buildZapRequestTemplate({
			pubkey,
			amount: 1,
			lnurl: bech32Lnurl.toUpperCase(),
			relays: ['wss://relay.nuts.cash'],
			createdAt: 1778502625
		});

		expect(template.tags).toContainEqual(['lnurl', bech32Lnurl]);
	});

	it('rejects malformed zap request fields', () => {
		const base = {
			pubkey,
			amount: 21,
			lnurl,
			relays: ['wss://relay.nuts.cash'],
			createdAt: 1778502625
		};

		expect(() => buildZapRequestTemplate({ ...base, pubkey: 'not-hex' })).toThrow(
			/recipient pubkey/
		);
		expect(() => buildZapRequestTemplate({ ...base, amount: 0 })).toThrow(/amount/);
		expect(() => buildZapRequestTemplate({ ...base, relays: [] })).toThrow(/relay/);
		expect(() => buildZapRequestTemplate({ ...base, noteId: 'not-hex' })).toThrow(/event tag/);
	});
});
