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
	it('publishes and parses a role with kind-scoped permission tags', () => {
		const tags = buildRoleDefinitionTags({
			d: 'cook',
			name: 'Cook',
			description: 'Kitchen staff',
			permissions: [
				{ capability: '30402', access: 'write' },
				{ capability: '37237', access: 'write' },
				{ capability: 'moderation' }
			]
		});

		expect(tags).toContainEqual(['t', 'role']);
		expect(tags).toContainEqual(['permission', '30402', 'write']);
		expect(tags).toContainEqual(['permission', '37237', 'write']);
		expect(tags).toContainEqual(['permission', 'moderation']);
		expect(tags.some((tag) => tag[0] === 'type')).toBe(false);
		expect(tags).not.toContainEqual(['t', 'sellable']);
		expect(parseRoleDefinition(stubEvent(tags))).toMatchObject({
			d: 'cook',
			name: 'Cook',
			permissions: [
				{ capability: '30402', access: 'write' },
				{ capability: '37237', access: 'write' },
				{ capability: 'moderation' }
			]
		});
	});

	it('parses a role without permission tags as granting nothing', () => {
		const tags = buildRoleDefinitionTags({
			d: 'greeter',
			name: 'Greeter',
			description: 'Recognition badge only'
		});

		const role = parseRoleDefinition(stubEvent(tags));
		expect(role).toMatchObject({ d: 'greeter', name: 'Greeter' });
		expect(role?.permissions).toEqual([]);
	});

	it.each(['membership', 'sellable', 'product', undefined])(
		'rejects definitions with topic %s as roles',
		(topic) => {
			const tags = [
				['d', 'not-a-role'],
				['name', 'Not a role'],
				['permission', 'settings'],
				...(topic ? [['t', topic]] : [])
			];
			expect(parseRoleDefinition(stubEvent(tags))).toBeUndefined();
		}
	);
});
