import { lookup } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { AbstractSimplePool } from 'nostr-tools/abstract-pool';
import { decode, type EventPointer } from 'nostr-tools/nip19';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools/pure';
import WebSocket from 'ws';

const MAX_RELAY_HINTS = 8;
const MAX_WEBSOCKET_PAYLOAD = 256 * 1024;
const POST_WAIT_MS = 2500;
const PROFILE_WAIT_MS = 1000;
const SUCCESS_CACHE_MS = 10 * 60 * 1000;
const MISS_CACHE_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 500;

export type PostPreview = {
	title: string;
	description?: string;
	image?: string;
	publishedTime: string;
};

type CacheEntry = {
	expiresAt: number;
	value: Promise<PostPreview | null>;
};

type ProfileMetadata = {
	name?: unknown;
	display_name?: unknown;
	displayName?: unknown;
};

const previewCache = new Map<string, CacheEntry>();

function accessDenied(message: string) {
	const error = new Error(message) as NodeJS.ErrnoException;
	error.code = 'EACCES';
	return error;
}

function isPublicIpv4(address: string) {
	const octets = address.split('.').map(Number);
	if (
		octets.length !== 4 ||
		octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
	) {
		return false;
	}

	const [a, b, c] = octets;
	return !(
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0 && c === 0) ||
		(a === 192 && b === 0 && c === 2) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		(a === 198 && b === 51 && c === 100) ||
		(a === 203 && b === 0 && c === 113) ||
		a >= 224
	);
}

function isPublicIpv6(address: string) {
	const normalized = address.toLowerCase().split('%')[0];
	if (normalized === '::' || normalized === '::1') return false;
	if (normalized.startsWith('::ffff:')) return false;

	const firstGroup = Number.parseInt(normalized.split(':')[0] || '0', 16);
	return !(
		(firstGroup & 0xfe00) === 0xfc00 ||
		(firstGroup & 0xffc0) === 0xfe80 ||
		(firstGroup & 0xff00) === 0xff00 ||
		normalized.startsWith('64:ff9b:') ||
		normalized.startsWith('2001:db8:')
	);
}

export function isPublicIpAddress(address: string) {
	const family = isIP(address);
	if (family === 4) return isPublicIpv4(address);
	if (family === 6) return isPublicIpv6(address);
	return false;
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
	lookup(hostname, { ...options, all: true }, (error, addresses) => {
		if (error) {
			callback(error, '', 0);
			return;
		}
		if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
			callback(accessDenied(`Relay hostname resolves to a non-public address: ${hostname}`), '', 0);
			return;
		}

		if (options.all) {
			callback(null, addresses);
			return;
		}
		callback(null, addresses[0].address, addresses[0].family);
	});
};

class PreviewWebSocket extends WebSocket {
	constructor(address: string | URL) {
		super(address, {
			followRedirects: false,
			handshakeTimeout: POST_WAIT_MS,
			lookup: safeLookup,
			maxPayload: MAX_WEBSOCKET_PAYLOAD,
			perMessageDeflate: false
		});
	}
}

function relayUrl(value: string) {
	try {
		const url = new URL(value);
		if ((url.protocol !== 'ws:' && url.protocol !== 'wss:') || url.username || url.password) {
			return null;
		}

		const hostname = url.hostname.replace(/^\[|\]$/g, '');
		if (isIP(hostname) && !isPublicIpAddress(hostname)) return null;
		if (
			hostname === 'localhost' ||
			hostname.endsWith('.localhost') ||
			hostname.endsWith('.local')
		) {
			return null;
		}

		url.hash = '';
		return url.toString();
	} catch {
		return null;
	}
}

function publicHttpUrl(value: string | undefined) {
	if (!value) return undefined;
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

function imetaValue(tag: string[], key: string) {
	const prefix = `${key} `;
	return tag
		.slice(1)
		.find((value) => value.startsWith(prefix))
		?.slice(prefix.length)
		.trim();
}

export function extractPostImage(event: Pick<NostrEvent, 'content' | 'tags'>) {
	for (const tag of event.tags) {
		if (tag[0] !== 'imeta') continue;
		const mimeType = imetaValue(tag, 'm');
		if (mimeType && !mimeType.toLowerCase().startsWith('image/')) continue;
		const image = publicHttpUrl(imetaValue(tag, 'url'));
		if (image) return image;
	}

	for (const tag of event.tags) {
		if (tag[0] !== 'image') continue;
		const image = publicHttpUrl(tag[1]);
		if (image) return image;
	}

	const imageUrlPattern =
		/https?:\/\/[^\s<>"')\]]+\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s<>"')\]]*)?/giu;
	for (const match of event.content.matchAll(imageUrlPattern)) {
		const image = publicHttpUrl(match[0]);
		if (image) return image;
	}
	return undefined;
}

function truncate(value: string, maxLength: number) {
	const characters = Array.from(value);
	if (characters.length <= maxLength) return value;
	return `${characters
		.slice(0, maxLength - 1)
		.join('')
		.trimEnd()}…`;
}

function cleanPostContent(content: string, image?: string) {
	let text = content;
	if (image) text = text.replace(image, '');
	return text
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/nostr:(?:note|nevent|nprofile|npub|naddr)1[023456789acdefghjklmnpqrstuvwxyz]+/gi, '')
		.replace(/[`*_~>#]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function postDescription(content: string, image?: string) {
	const cleaned = cleanPostContent(content, image);
	return cleaned ? truncate(cleaned, 220) : undefined;
}

function profileMetadata(event: NostrEvent | null) {
	if (!event || event.kind !== 0 || !verifyEvent(event)) return null;
	try {
		const metadata = JSON.parse(event.content) as ProfileMetadata;
		return metadata && typeof metadata === 'object' ? metadata : null;
	} catch {
		return null;
	}
}

function metadataString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function profileName(profile: ProfileMetadata | null) {
	const name =
		metadataString(profile?.display_name) ||
		metadataString(profile?.name) ||
		metadataString(profile?.displayName);
	return name ? truncate(name, 80) : undefined;
}

function parseNevent(nevent: string) {
	try {
		const decoded = decode(nevent);
		return decoded.type === 'nevent' ? decoded.data : null;
	} catch {
		return null;
	}
}

function fallbackRelays() {
	const configured = process.env.NUTS_PREVIEW_RELAYS || process.env.VITE_DEFAULT_RELAYS || '';
	return configured
		.split(',')
		.map((relay) => relay.trim())
		.filter(Boolean);
}

async function fetchPostPreview(pointer: EventPointer): Promise<PostPreview | null> {
	const relays = Array.from(
		new Set(
			(pointer.relays?.length ? pointer.relays : fallbackRelays())
				.map(relayUrl)
				.filter((relay): relay is string => Boolean(relay))
		)
	).slice(0, MAX_RELAY_HINTS);
	if (!relays.length) return null;

	const pool = new AbstractSimplePool({
		verifyEvent,
		websocketImplementation: PreviewWebSocket as unknown as typeof globalThis.WebSocket
	});

	try {
		const profilePromise = pointer.author
			? pool.get(
					relays,
					{ kinds: [0], authors: [pointer.author], limit: 1 },
					{ maxWait: PROFILE_WAIT_MS }
				)
			: Promise.resolve(null);
		const event = await pool.get(
			relays,
			{ kinds: [1], ids: [pointer.id], limit: 1 },
			{ maxWait: POST_WAIT_MS }
		);
		if (!event || event.kind !== 1 || event.id !== pointer.id || !verifyEvent(event)) return null;

		let profileEvent = await profilePromise;
		if (!profileEvent || profileEvent.pubkey !== event.pubkey) {
			profileEvent = await pool.get(
				relays,
				{ kinds: [0], authors: [event.pubkey], limit: 1 },
				{ maxWait: PROFILE_WAIT_MS }
			);
		}
		const profile = profileMetadata(profileEvent?.pubkey === event.pubkey ? profileEvent : null);
		const author = profileName(profile);
		const image = extractPostImage(event);

		return {
			title: author ? `Note from ${author}` : 'Note',
			description: postDescription(event.content, image),
			image,
			publishedTime: new Date(event.created_at * 1000).toISOString()
		};
	} catch {
		return null;
	} finally {
		pool.destroy();
	}
}

function trimCache() {
	while (previewCache.size > MAX_CACHE_ENTRIES) {
		const oldestKey = previewCache.keys().next().value;
		if (oldestKey === undefined) return;
		previewCache.delete(oldestKey);
	}
}

export function neventFromPath(pathname: string) {
	const prefix = '/explore/nevent:';
	if (!pathname.startsWith(prefix)) return null;
	const encoded = pathname.slice(prefix.length).replace(/\/$/, '');
	if (!encoded || encoded.includes('/')) return null;
	try {
		const nevent = decodeURIComponent(encoded);
		return nevent.startsWith('nevent1') && nevent.length <= 5000 ? nevent : null;
	} catch {
		return null;
	}
}

export function getPostPreview(nevent: string) {
	const pointer = parseNevent(nevent);
	if (!pointer) return Promise.resolve(null);

	const now = Date.now();
	const cached = previewCache.get(nevent);
	if (cached && cached.expiresAt > now) return cached.value;
	if (cached) previewCache.delete(nevent);

	const value = fetchPostPreview(pointer);
	const entry = { expiresAt: now + SUCCESS_CACHE_MS, value };
	previewCache.set(nevent, entry);
	trimCache();

	void value.then((preview) => {
		if (!preview && previewCache.get(nevent) === entry) {
			entry.expiresAt = Date.now() + MISS_CACHE_MS;
		}
	});
	return value;
}

function escapeAttribute(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

export function renderPostPreviewHead(preview: PostPreview | null, pageUrl: URL) {
	const title = preview?.title || 'Note';
	const image = preview?.image || new URL('/app-icon-512.png', pageUrl).toString();
	const card = preview?.image ? 'summary_large_image' : 'summary';
	const tags = [
		['property', 'og:type', 'article'],
		['property', 'og:site_name', 'Nuts'],
		['property', 'og:title', title],
		['property', 'og:url', pageUrl.toString()],
		['property', 'og:image', image],
		['property', 'og:image:alt', `Preview of ${title}`],
		['name', 'twitter:card', card],
		['name', 'twitter:title', title],
		['name', 'twitter:image', image]
	];
	if (preview?.description) {
		tags.push(
			['property', 'og:description', preview.description],
			['name', 'twitter:description', preview.description]
		);
	}
	if (preview?.publishedTime) {
		tags.push(['property', 'article:published_time', preview.publishedTime]);
	}

	return tags
		.map(
			([attribute, name, content]) =>
				`<meta ${attribute}="${escapeAttribute(name)}" content="${escapeAttribute(content)}">`
		)
		.join('\n');
}
