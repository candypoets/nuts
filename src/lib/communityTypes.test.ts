import { describe, expect, it } from 'vitest';

import { NAMED_CAPABILITIES, permissionKind } from './nip97';
import {
	archetypeFor,
	COMMUNITY_ARCHETYPES,
	DEFAULT_COMMUNITY_TYPE,
	isCommunityType,
	STORE_PRESETS,
	storePresetFor
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

	it('uses only valid NIP-97 permissions in suggested roles', () => {
		for (const archetype of COMMUNITY_ARCHETYPES) {
			for (const role of archetype.suggestedRoles) {
				for (const permission of role.permissions) {
					// Kind-scoped capability or a named off-relay capability.
					const isKindScoped = permissionKind(permission) !== undefined;
					const isNamed = (NAMED_CAPABILITIES as readonly string[]).includes(permission.capability);
					expect(isKindScoped || isNamed).toBe(true);
					// Never grant the privilege-escalation boundary (NIP-97).
					expect(permissionKind(permission)).not.toBe(30009);
					if (permission.access !== undefined) {
						expect(['read', 'write']).toContain(permission.access);
					}
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

	it('provides a complete, valid Store preset for every archetype', () => {
		const definitionTypes = new Set(['product', 'membership', 'pass']);
		const productKinds = new Set(['food', 'drink', 'merchandise', 'generic']);

		expect(Object.keys(STORE_PRESETS).sort()).toEqual(
			COMMUNITY_ARCHETYPES.map((archetype) => archetype.id).sort()
		);
		for (const archetype of COMMUNITY_ARCHETYPES) {
			const preset = storePresetFor(archetype.id);
			expect(preset.title.trim().length).toBeGreaterThan(0);
			expect(preset.intro.trim().length).toBeGreaterThan(0);
			expect(preset.itemLabel.trim().length).toBeGreaterThan(0);
			expect(preset.itemsLabel.trim().length).toBeGreaterThan(0);
			expect(preset.sectionLabel.trim().length).toBeGreaterThan(0);
			expect(preset.suggestedDefinitionTypes.length).toBeGreaterThan(0);
			expect(preset.suggestedDefinitionTypes).toContain('pass');
			expect(new Set(preset.suggestedDefinitionTypes).size).toBe(
				preset.suggestedDefinitionTypes.length
			);
			expect(preset.suggestedDefinitionTypes.every((type) => definitionTypes.has(type))).toBe(true);
			expect(preset.suggestedProductKinds.length).toBeGreaterThan(0);
			expect(new Set(preset.suggestedProductKinds).size).toBe(preset.suggestedProductKinds.length);
			expect(preset.suggestedProductKinds.every((kind) => productKinds.has(kind))).toBe(true);
			expect(preset.suggestedSections.every((section) => section.trim().length > 0)).toBe(true);
			expect(new Set(preset.suggestedSections).size).toBe(preset.suggestedSections.length);
		}

		expect(storePresetFor('hospitality').presentation).toBe('menu');
		expect(storePresetFor('hospitality').title).toBe('Menu & store');
		expect(
			COMMUNITY_ARCHETYPES.filter((archetype) => archetype.id !== 'hospitality').every(
				(archetype) => storePresetFor(archetype.id).presentation === 'catalog'
			)
		).toBe(true);
		expect(storePresetFor(undefined)).toBe(STORE_PRESETS[DEFAULT_COMMUNITY_TYPE]);
	});

	it('routes archetype membership shortcuts to the Store membership filter', () => {
		for (const id of ['sports', 'hospitality', 'club', 'professional'] as const) {
			expect(archetypeFor(id).actions).toContainEqual(
				expect.objectContaining({ segment: 'store', storeType: 'membership' })
			);
		}
	});
});
