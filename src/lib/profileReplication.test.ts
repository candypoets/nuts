import type { Kind0Parsed } from '@candypoets/nipworker';
import { describe, expect, it } from 'vitest';

import {
	buildProfileLightningAddressEvent,
	buildProfileReplicationEvent
} from './profileReplication';

const value = (values: Record<string, string | null>, key: string) => () => values[key] ?? null;

function profileView(values: Record<string, string | null>) {
	return {
		name: value(values, 'name'),
		displayName: value(values, 'displayName'),
		picture: value(values, 'picture'),
		banner: value(values, 'banner'),
		about: value(values, 'about'),
		website: value(values, 'website'),
		nip05: value(values, 'nip05'),
		lud06: value(values, 'lud06'),
		lud16: value(values, 'lud16'),
		github: value(values, 'github'),
		twitter: value(values, 'twitter'),
		mastodon: value(values, 'mastodon'),
		nostr: value(values, 'nostr'),
		displayNameAlt: value(values, 'displayNameAlt'),
		username: value(values, 'username'),
		bio: value(values, 'bio'),
		image: value(values, 'image'),
		avatar: value(values, 'avatar'),
		background: value(values, 'background')
	} as unknown as Kind0Parsed;
}

describe('buildProfileReplicationEvent', () => {
	it('serializes the existing zero-copy kind-0 fields', () => {
		const event = buildProfileReplicationEvent(
			profileView({
				name: 'alice',
				displayName: 'Alice',
				picture: 'https://example.com/alice.png',
				about: 'Hello',
				lud16: 'alice@example.com',
				displayNameAlt: 'Alice Alt'
			}),
			{ name: 'ignored' },
			123
		);

		expect(event).toEqual({
			kind: 0,
			tags: [],
			content: JSON.stringify({
				name: 'alice',
				display_name: 'Alice',
				picture: 'https://example.com/alice.png',
				about: 'Hello',
				lud16: 'alice@example.com',
				displayName: 'Alice Alt'
			}),
			created_at: 123
		});
	});

	it('builds a new profile from fallback fields', () => {
		const event = buildProfileReplicationEvent(
			undefined,
			{
				name: 'Bob',
				display_name: 'Bob',
				picture: '',
				about: 'Member of Moonshot'
			},
			456
		);

		expect(JSON.parse(event.content)).toEqual({
			name: 'Bob',
			display_name: 'Bob',
			picture: '',
			about: 'Member of Moonshot'
		});
	});

	it('creates a valid minimal kind-0 when no profile exists', () => {
		const event = buildProfileReplicationEvent(undefined, {}, 789);

		expect(event).toEqual({
			kind: 0,
			tags: [],
			content: '{}',
			created_at: 789
		});
	});

	it('updates only lud16 while preserving parsed profile metadata', () => {
		const event = buildProfileLightningAddressEvent(
			profileView({
				name: 'alice',
				displayName: 'Alice',
				about: 'Hello',
				lud16: 'old@example.com',
				github: 'alice'
			}),
			'alice@nuts.cash',
			999
		);

		expect(JSON.parse(event.content)).toEqual({
			name: 'alice',
			display_name: 'Alice',
			about: 'Hello',
			lud16: 'alice@nuts.cash',
			github: 'alice'
		});
		expect(event.created_at).toBe(999);
	});
});
