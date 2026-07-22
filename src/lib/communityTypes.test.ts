import { describe, expect, it } from 'vitest';

import { ADMIN_PERMISSION_KEYS } from './adminAccess';
import {
	archetypeFor,
	COMMUNITY_ARCHETYPES,
	DEFAULT_COMMUNITY_TYPE,
	isCommunityType
} from './communityTypes';
import { roleDFromName } from './nip58Roles';

describe('community archetype registry', () => {
	it('recognizes every registered type and rejects unknown ones', () => {
		for (const archetype of COMMUNITY_ARCHETYPES) {
			expect(isCommunityType(archetype.id)).toBe(true);
		}
		expect(isCommunityType('space-colony')).toBe(false);
		expect(isCommunityType(undefined)).toBe(false);
	});

	it('falls back to the default archetype for unknown or missing types', () => {
		expect(archetypeFor(undefined).id).toBe(DEFAULT_COMMUNITY_TYPE);
		expect(archetypeFor('sports').id).toBe('sports');
	});

	it('has unique ids and non-empty presentation fields', () => {
		const ids = COMMUNITY_ARCHETYPES.map((archetype) => archetype.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const archetype of COMMUNITY_ARCHETYPES) {
			expect(archetype.label.trim().length).toBeGreaterThan(0);
			expect(archetype.shortLabel.trim().length).toBeGreaterThan(0);
			expect(archetype.tagline.trim().length).toBeGreaterThan(0);
			expect(archetype.highlights.length).toBeGreaterThan(0);
			expect(archetype.actions.length).toBeGreaterThan(0);
		}
	});

	it('uses only known admin permissions in suggested roles', () => {
		for (const archetype of COMMUNITY_ARCHETYPES) {
			for (const role of archetype.suggestedRoles) {
				for (const permission of role.permissions) {
					expect(ADMIN_PERMISSION_KEYS).toContain(permission);
				}
			}
		}
	});

	it('has suggested role names that slugify to unique, non-empty d-tags', () => {
		for (const archetype of COMMUNITY_ARCHETYPES) {
			const ds = archetype.suggestedRoles.map((role) => roleDFromName(role.name));
			for (const d of ds) {
				expect(d.length).toBeGreaterThan(0);
			}
			expect(new Set(ds).size).toBe(ds.length);
		}
	});
});
