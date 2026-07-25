import type { ParsedEvent } from '@candypoets/nipworker';
import { describe, expect, it } from 'vitest';

import { buildRoleDefinitionTags, parseRoleDefinition } from './nip58Roles';

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

describe('NIP-58 role definitions', () => {
	it('publishes and parses an explicit role type', () => {
		const tags = buildRoleDefinitionTags({
			d: 'cook',
			name: 'Cook',
			description: 'Kitchen staff',
			permissions: ['events']
		});

		expect(tags).toContainEqual(['type', 'role']);
		expect(tags).toContainEqual(['t', 'role']);
		expect(tags).not.toContainEqual(['t', 'sellable']);
		expect(parseRoleDefinition(stubEvent(tags))).toMatchObject({
			d: 'cook',
			name: 'Cook',
			permissions: ['events']
		});
	});

	it.each(['membership', 'event_access', 'product', 'pass', undefined])(
		'rejects %s definitions as roles',
		(type) => {
			const tags = [['d', 'not-a-role'], ['name', 'Not a role'], ...(type ? [['type', type]] : [])];
			expect(parseRoleDefinition(stubEvent(tags))).toBeUndefined();
		}
	);

	it('rejects role definitions without the indexed role topic', () => {
		expect(
			parseRoleDefinition(
				stubEvent([
					['d', 'cook'],
					['type', 'role'],
					['name', 'Cook']
				])
			)
		).toBeUndefined();
		expect(
			parseRoleDefinition(
				stubEvent([
					['d', 'cook'],
					['type', 'role'],
					['t', 'sellable'],
					['name', 'Cook']
				])
			)
		).toBeUndefined();
	});
});
