import type { Kind0Parsed } from '@candypoets/nipworker';
import type { EventTemplate } from 'nostr-tools';

export type ProfileFallback = {
	name?: string;
	display_name?: string;
	picture?: string;
	about?: string;
};

type ProfileMetadata = Record<string, string>;

function addMetadataField(
	metadata: ProfileMetadata,
	key: string,
	value: string | null | undefined
) {
	if (value !== null && value !== undefined) metadata[key] = value;
}

/**
 * Builds a fresh kind-0 template from nipworker's zero-copy profile view.
 *
 * This is an intentional copy boundary: publishing requires JSON content, so the
 * FlatBuffer fields are read once here instead of being unpacked into an
 * intermediate generated object.
 */
export function buildProfileReplicationEvent(
	profile: Kind0Parsed | null | undefined,
	fallback: ProfileFallback,
	createdAt: number
): EventTemplate {
	const metadata: ProfileMetadata = {};

	if (profile) {
		addMetadataField(metadata, 'name', profile.name());
		addMetadataField(metadata, 'display_name', profile.displayName());
		addMetadataField(metadata, 'picture', profile.picture());
		addMetadataField(metadata, 'banner', profile.banner());
		addMetadataField(metadata, 'about', profile.about());
		addMetadataField(metadata, 'website', profile.website());
		addMetadataField(metadata, 'nip05', profile.nip05());
		addMetadataField(metadata, 'lud06', profile.lud06());
		addMetadataField(metadata, 'lud16', profile.lud16());
		addMetadataField(metadata, 'github', profile.github());
		addMetadataField(metadata, 'twitter', profile.twitter());
		addMetadataField(metadata, 'mastodon', profile.mastodon());
		addMetadataField(metadata, 'nostr', profile.nostr());
		addMetadataField(metadata, 'displayName', profile.displayNameAlt());
		addMetadataField(metadata, 'username', profile.username());
		addMetadataField(metadata, 'bio', profile.bio());
		addMetadataField(metadata, 'image', profile.image());
		addMetadataField(metadata, 'avatar', profile.avatar());
		addMetadataField(metadata, 'background', profile.background());
	} else {
		addMetadataField(metadata, 'name', fallback.name);
		addMetadataField(metadata, 'display_name', fallback.display_name);
		addMetadataField(metadata, 'picture', fallback.picture);
		addMetadataField(metadata, 'about', fallback.about);
	}

	return {
		kind: 0,
		tags: [],
		content: JSON.stringify(metadata),
		created_at: createdAt
	};
}
