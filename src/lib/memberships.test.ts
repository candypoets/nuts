import { describe, expect, it } from 'vitest';

import { BADGE_DEFINITION_TYPE_TOPICS, CATALOG_SELLABLE_TAG } from './catalog';
import { buildMembershipDefinitionTags } from './memberships';

describe('membership definition tags', () => {
	it('marks memberships as sellable', () => {
		const tags = buildMembershipDefinitionTags({
			d: 'membership-supporter',
			name: 'Supporter',
			description: 'Supporter membership',
			price: '60',
			currency: 'EUR',
			billing: 'yearly',
			stripeAccountId: 'acct_123'
		});

		expect(tags).toContainEqual(['t', BADGE_DEFINITION_TYPE_TOPICS.membership]);
		expect(tags).toContainEqual(['t', CATALOG_SELLABLE_TAG]);
		expect(tags).toContainEqual(['availability', 'available']);
	});
});
