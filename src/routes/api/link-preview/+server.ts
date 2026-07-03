import { json, type RequestHandler } from '@sveltejs/kit';
import { lookup } from 'node:dns/promises';
import * as net from 'node:net';

type LinkPreview = {
	url: string;
	title?: string;
	description?: string;
	image?: string;
	siteName?: string;
};

const cache = new Map<string, LinkPreview | null>();
const inflight = new Map<string, Promise<LinkPreview | null>>();
const cacheLimit = 250;
const timeoutMs = 6000;
const maxBytes = 256 * 1024;
const maxRedirects = 4;

const titleTagRegex = /<title[^>]*>([^<]+)<\/title>/i;
const youtubeRegex =
	/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

export const GET: RequestHandler = async ({ url, fetch }) => {
	const rawUrl = url.searchParams.get('url');
	if (!rawUrl) return json({ error: 'Missing url parameter' }, { status: 400 });

	const normalized = normalizeUrl(rawUrl);
	if (!normalized) return json({ error: 'Invalid URL' }, { status: 400 });

	if (cache.has(normalized)) {
		const cached = cache.get(normalized);
		return json({ preview: cached });
	}

	let task = inflight.get(normalized);
	if (!task) {
		task = fetchPreview(normalized, fetch)
			.then((preview) => {
				store(normalized, preview);
				return preview;
			})
			.finally(() => inflight.delete(normalized));
		inflight.set(normalized, task);
	}

	try {
		return json({ preview: await task });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to load link preview' },
			{ status: 502 }
		);
	}
};

async function fetchPreview(
	urlString: string,
	fetchFn: typeof fetch
): Promise<LinkPreview | null> {
	const youtubeVideoId = getYoutubeVideoId(urlString);
	if (youtubeVideoId) {
		const youtube = await fetchYoutubeOembed(urlString, youtubeVideoId, fetchFn);
		if (youtube) return youtube;
	}

	const response = await guardedFetch(urlString, fetchFn);
	if (!response.ok) return synthesizeYoutubeChannelPreview(urlString);

	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	if (contentType && !contentType.includes('text/html') && !contentType.includes('xhtml')) {
		return synthesizeYoutubeChannelPreview(urlString);
	}

	const html = await readLimitedText(response);
	return parsePreview(html, response.url || urlString) ?? synthesizeYoutubeChannelPreview(urlString);
}

async function guardedFetch(urlString: string, fetchFn: typeof fetch) {
	let current = urlString;

	for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
		await assertPublicHttpUrl(current);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetchFn(current, {
				redirect: 'manual',
				signal: controller.signal,
				headers: {
					Accept: 'text/html,application/xhtml+xml',
					'User-Agent':
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
				}
			});

			if (![301, 302, 303, 307, 308].includes(response.status)) return response;

			const location = response.headers.get('location');
			if (!location) return response;
			current = new URL(location, current).toString();
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new Error('Too many redirects');
}

async function assertPublicHttpUrl(urlString: string) {
	const url = new URL(urlString);
	if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL protocol');

	const hostname = url.hostname.toLowerCase();
	if (
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		hostname.endsWith('.internal')
	) {
		throw new Error('Private hosts are not allowed');
	}

	if (net.isIP(hostname)) {
		if (isPrivateIp(hostname)) throw new Error('Private IPs are not allowed');
		return;
	}

	const records = await lookup(hostname, { all: true, verbatim: true });
	if (!records.length || records.some((record) => isPrivateIp(record.address))) {
		throw new Error('Private hosts are not allowed');
	}
}

function isPrivateIp(address: string) {
	if (net.isIPv4(address)) {
		const parts = address.split('.').map(Number);
		const [a, b] = parts;
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 198 && (b === 18 || b === 19)) ||
			a >= 224
		);
	}

	const normalized = address.toLowerCase();
	return (
		normalized === '::1' ||
		normalized === '::' ||
		normalized.startsWith('fc') ||
		normalized.startsWith('fd') ||
		normalized.startsWith('fe80:')
	);
}

async function readLimitedText(response: Response) {
	const reader = response.body?.getReader();
	if (!reader) return '';

	const chunks: Uint8Array[] = [];
	let received = 0;

	while (received < maxBytes) {
		const { done, value } = await reader.read();
		if (done || !value) break;

		const remaining = maxBytes - received;
		chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
		received += Math.min(value.length, remaining);
	}

	await reader.cancel().catch(() => undefined);
	return new TextDecoder().decode(concat(chunks, received));
}

function concat(chunks: Uint8Array[], length: number) {
	const output = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}
	return output;
}

function parsePreview(html: string, pageUrl: string): LinkPreview | null {
	const meta = extractMeta(html);
	const title = meta['og:title'] || meta['twitter:title'] || html.match(titleTagRegex)?.[1]?.trim();
	const description = meta['og:description'] || meta.description || meta['twitter:description'];
	const image = meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'];
	const siteName = meta['og:site_name'] || meta['application-name'];

	const preview: LinkPreview = {
		url: pageUrl,
		title: title ? unescapeHtml(title) : undefined,
		description: description ? unescapeHtml(description) : undefined,
		image: image ? resolveUrl(unescapeHtml(image), pageUrl) ?? undefined : undefined,
		siteName: siteName ? unescapeHtml(siteName) : undefined
	};

	return preview.title || preview.image ? preview : null;
}

function extractMeta(html: string) {
	const values: Record<string, string> = {};
	const tagRegex = /<meta\s+[^>]*>/gi;
	const attrRegex = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

	let tagMatch: RegExpExecArray | null;
	while ((tagMatch = tagRegex.exec(html))) {
		const attrs: Record<string, string> = {};
		attrRegex.lastIndex = 0;

		let attrMatch: RegExpExecArray | null;
		while ((attrMatch = attrRegex.exec(tagMatch[0]))) {
			attrs[attrMatch[1].toLowerCase()] = attrMatch[2] || attrMatch[3] || attrMatch[4] || '';
		}

		const key = (attrs.property || attrs.name || '').toLowerCase();
		if (key && attrs.content && values[key] === undefined) values[key] = attrs.content;
	}

	return values;
}

async function fetchYoutubeOembed(
	urlString: string,
	videoId: string,
	fetchFn: typeof fetch
): Promise<LinkPreview | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
		urlString
	)}&format=json`;

	try {
		const response = await fetchFn(oembedUrl, { signal: controller.signal });
		if (!response.ok) return null;

		const data = await response.json();
		if (!data || typeof data.title !== 'string') return null;

		return {
			url: urlString,
			title: data.title,
			description: typeof data.author_name === 'string' ? data.author_name : undefined,
			image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
			siteName: 'YouTube'
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function synthesizeYoutubeChannelPreview(urlString: string): LinkPreview | null {
	try {
		const url = new URL(urlString);
		const host = url.hostname.toLowerCase();
		if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) return null;

		const path = url.pathname;
		let title: string | undefined;
		if (path.includes('/@')) title = path.replace(/^\/+/, '').split('/')[0];
		else if (path.startsWith('/c/')) title = `@${path.slice(3).split('/')[0]}`;
		else if (path.startsWith('/channel/')) title = path.slice(9).split('/')[0];
		else if (path.startsWith('/user/')) title = `@${path.slice(6).split('/')[0]}`;

		return title ? { url: urlString, title, description: 'YouTube channel', siteName: 'YouTube' } : null;
	} catch {
		return null;
	}
}

function getYoutubeVideoId(urlString: string) {
	return urlString.match(youtubeRegex)?.[1] ?? null;
}

function normalizeUrl(urlString: string) {
	try {
		const url = new URL(/^https?:\/\//i.test(urlString) ? urlString : `https://${urlString}`);
		if (!['http:', 'https:'].includes(url.protocol)) return null;
		url.hash = '';
		return url.toString();
	} catch {
		return null;
	}
}

function resolveUrl(raw: string, pageUrl: string) {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	try {
		return new URL(trimmed, pageUrl).toString();
	} catch {
		return null;
	}
}

function unescapeHtml(value: string) {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'");
}

function store(url: string, data: LinkPreview | null) {
	if (cache.size >= cacheLimit) {
		const oldest = cache.keys().next().value;
		if (oldest) cache.delete(oldest);
	}
	cache.set(url, data);
}
