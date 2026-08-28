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
const DEFAULT_PREVIEW_IMAGE_PATH =
	'/community_feed_static_assets/layouts/community-feed-hero-composition.png';

export type PostPreview = {
	title: string;
	description?: string;
	image?: string;
	imageType?: string;
	imageWidth?: number;
	imageHeight?: number;
	publishedTime: string;
};

type PostImage = {
	url: string;
	type?: string;
	width?: number;
	height?: number;
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

function imageTypeFromUrl(value: string) {
	try {
		const extension = new URL(value).pathname.split('.').pop()?.toLowerCase();
		switch (extension) {
			case 'avif':
				return 'image/avif';
			case 'gif':
				return 'image/gif';
			case 'jpeg':
			case 'jpg':
				return 'image/jpeg';
			case 'png':
				return 'image/png';
			case 'webp':
				return 'image/webp';
		}
	} catch {
		// The URL was already validated by publicHttpUrl; omit an unknown type.
	}
	return undefined;
}

function imageDimensions(value: string | undefined) {
	const match = value?.match(/^(\d{1,5})x(\d{1,5})$/i);
	if (!match) return {};
	const width = Number(match[1]);
	const height = Number(match[2]);
	return width > 0 && height > 0 ? { width, height } : {};
}

export function extractPostImageMetadata(
	event: Pick<NostrEvent, 'content' | 'tags'>
): PostImage | undefined {
	for (const tag of event.tags) {
		if (tag[0] !== 'imeta') continue;
		const mimeType = imetaValue(tag, 'm');
		if (mimeType && !mimeType.toLowerCase().startsWith('image/')) continue;
		const image = publicHttpUrl(imetaValue(tag, 'url'));
		if (image) {
			return {
				url: image,
				type: mimeType || imageTypeFromUrl(image),
				...imageDimensions(imetaValue(tag, 'dim'))
			};
		}
	}

	for (const tag of event.tags) {
		if (tag[0] !== 'image') continue;
		const image = publicHttpUrl(tag[1]);
		if (image) return { url: image, type: imageTypeFromUrl(image) };
	}

	const imageUrlPattern =
		/https?:\/\/[^\s<>"')\]]+\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s<>"')\]]*)?/giu;
	for (const match of event.content.matchAll(imageUrlPattern)) {
		const image = publicHttpUrl(match[0]);
		if (image) return { url: image, type: imageTypeFromUrl(image) };
	}
	return undefined;
}

export function extractPostImage(event: Pick<NostrEvent, 'content' | 'tags'>) {
	return extractPostImageMetadata(event)?.url;
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

function eventTag(event: Pick<NostrEvent, 'tags'>, key: string) {
	return event.tags.find((tag) => tag[0] === key && tag[1]?.trim())?.[1]?.trim();
}

function previewTitle(event: NostrEvent, author?: string) {
	const eventTitle = eventTag(event, 'title') || eventTag(event, 'subject');
	if (eventTitle) return truncate(eventTitle, 100);
	return author ? `${author} on Nuts` : 'A post on Nuts';
}

function previewDescription(event: NostrEvent, image?: string) {
	const summary = eventTag(event, 'summary');
	return summary
		? truncate(summary.replace(/\s+/g, ' ').trim(), 220)
		: postDescription(event.content, image);
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
			{
				ids: [pointer.id],
				...(pointer.kind === undefined ? {} : { kinds: [pointer.kind] }),
				limit: 1
			},
			{ maxWait: POST_WAIT_MS }
		);
		if (!event || event.id !== pointer.id || !verifyEvent(event)) return null;

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
		const image = extractPostImageMetadata(event);

		return {
			title: previewTitle(event, author),
			description: previewDescription(event, image?.url),
			image: image?.url,
			imageType: image?.type,
			imageWidth: image?.width,
			imageHeight: image?.height,
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
	const canonicalUrl = new URL(pageUrl);
	canonicalUrl.search = '';
	canonicalUrl.hash = '';
	const title = preview?.title || 'A post on Nuts';
	const description = preview?.description || 'See the post and join the conversation on Nuts.';
	const fallbackImage: PostImage = {
		url: new URL(DEFAULT_PREVIEW_IMAGE_PATH, canonicalUrl).toString(),
		type: 'image/png',
		width: 1642,
		height: 958
	};
	const image: PostImage = preview?.image
		? {
				url: preview.image,
				type: preview.imageType || imageTypeFromUrl(preview.image),
				width: preview.imageWidth,
				height: preview.imageHeight
			}
		: fallbackImage;
	const tags = [
		['property', 'og:type', 'article'],
		['property', 'og:site_name', 'Nuts'],
		['property', 'og:locale', 'en_US'],
		['property', 'og:title', title],
		['property', 'og:description', description],
		['property', 'og:url', canonicalUrl.toString()],
		['property', 'og:image', image.url],
		...(image.url.startsWith('https:') ? [['property', 'og:image:secure_url', image.url]] : []),
		...(image.type ? [['property', 'og:image:type', image.type]] : []),
		...(image.width ? [['property', 'og:image:width', String(image.width)]] : []),
		...(image.height ? [['property', 'og:image:height', String(image.height)]] : []),
		['property', 'og:image:alt', `Preview of ${title}`],
		['name', 'twitter:card', 'summary_large_image'],
		['name', 'twitter:title', title],
		['name', 'twitter:description', description],
		['name', 'twitter:image', image.url],
		['name', 'twitter:image:alt', `Preview of ${title}`]
	];
	if (preview?.image && preview.image !== fallbackImage.url) {
		tags.push(
			['property', 'og:image', fallbackImage.url],
			['property', 'og:image:secure_url', fallbackImage.url],
			['property', 'og:image:type', fallbackImage.type!],
			['property', 'og:image:width', String(fallbackImage.width)],
			['property', 'og:image:height', String(fallbackImage.height)],
			['property', 'og:image:alt', 'Nuts, the social network for real communities']
		);
	}
	if (preview?.publishedTime) {
		tags.push(['property', 'article:published_time', preview.publishedTime]);
	}

	const metadata = tags
		.map(
			([attribute, name, content]) =>
				`<meta ${attribute}="${escapeAttribute(name)}" content="${escapeAttribute(content)}">`
		)
		.join('\n');

	return `<title>${escapeAttribute(title)} | Nuts</title>\n<link rel="canonical" href="${escapeAttribute(canonicalUrl.toString())}">\n<meta name="description" content="${escapeAttribute(description)}">\n${metadata}`;
}
