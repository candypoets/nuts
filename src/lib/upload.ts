import { useSignEvent } from '@candypoets/nipworker/hooks';
import { get } from 'svelte/store';
import { preferredUploadServer, blossomServers, nip96Servers } from 'src/controller/nostr';

export type UploadResult = {
	url: string;
	sha256: string;
	tags: string[][];
};

// Default fallback server (Blossom)
export const DEFAULT_SERVER = 'https://blossom.nuts.cash';

async function sha256HexFile(file: File): Promise<string> {
	// Web Crypto API requires secure context (HTTPS)
	if (!crypto.subtle) {
		throw new Error(
			'Image upload requires a secure connection (HTTPS). ' +
			'Please access the app via https:// or localhost.'
		);
	}
	const buf = await file.arrayBuffer();
	const hash = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function discoverNip96UploadUrl(baseUrl: string): Promise<string> {
	try {
		const wellKnown = new URL('/.well-known/nostr/nip96.json', baseUrl).toString();
		const res = await fetch(wellKnown, { method: 'GET' });
		if (res.ok) {
			const j = await res.json();
			if (j?.api_url) return j.api_url as string;
			if (j?.upload) return j.upload as string;
			if (j?.endpoints?.upload) return j.endpoints.upload as string;
		}
	} catch {
		// ignore discovery errors
	}
	// Fallback commonly used by nostr.build deployments
	return new URL('/api/v2/media', baseUrl).toString();
}

async function makeNip98AuthHeader(
	url: string,
	method: string,
	payloadHash: string
): Promise<string> {
	const unsigned = {
		kind: 27235,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['u', url],
			['method', method],
			['payload', payloadHash]
		],
		content: ''
	};

	return await new Promise((resolve) => {
		useSignEvent(unsigned, (signedEvent) => {
			const token = btoa(JSON.stringify(signedEvent));
			resolve(`Nostr ${token}`);
		});
	});
}

function extractUploadedUrl(json: any): string | null {
	return (
		json?.nip94_event?.tags?.find((t: string[]) => t?.[0] === 'url')?.[1] ||
		json?.url ||
		json?.result?.url ||
		json?.data?.url ||
		json?.nurl ||
		null
	);
}

// Build NIP-94 tags from file metadata
async function buildNip94Tags(
	file: File,
	sha256: string,
	url: string,
	opts?: {
		alt?: string;
		includeMimeTag?: boolean;
		includeDimensions?: boolean;
	}
): Promise<string[][]> {
	const tags: string[][] = [];

	// alt text
	const alt = opts?.alt || file.name || '';
	if (alt) tags.push(['alt', alt]);

	// mime type
	if (opts?.includeMimeTag && file.type) {
		tags.push(['m', file.type]);
	}

	// dimensions for images if requested
	if (opts?.includeDimensions && file.type?.startsWith('image/')) {
		try {
			const bmp = await createImageBitmap(file);
			tags.push(['dim', `${bmp.width}x${bmp.height}`]);
		} catch {
			// ignore if we can't read dimensions
		}
	}

	return tags;
}

// Upload to a NIP-96 server
export async function nip96Upload(
	file: File,
	opts?: {
		server?: string;
		alt?: string;
		includeMimeTag?: boolean;
		includeDimensions?: boolean;
	}
): Promise<UploadResult> {
	const server = opts?.server ?? DEFAULT_SERVER;

	// Hash of raw file
	const sha256 = await sha256HexFile(file);

	const uploadUrl = await discoverNip96UploadUrl(server);
	const authorization = await makeNip98AuthHeader(uploadUrl, 'POST', sha256);

	const form = new FormData();
	form.append('file', file, file.name);

	const res = await fetch('https://proxy.nuts.cash?url=' + uploadUrl, {
		method: 'POST',
		headers: { Authorization: authorization },
		body: form
	});

	const json = await res.json().catch(() => null as any);
	const url = extractUploadedUrl(json);

	if (!res.ok || !url) {
		throw new Error((json?.message as string) || `Upload failed with status ${res.status}`);
	}

	// Build additional NIP-94 tags
	const tags = await buildNip94Tags(file, sha256, url, opts);

	// include any extra server-provided tags, except ones auto-inferred by the editor
	const exclude = new Set(['url', 'x', 'ox', 'm', 'size']);
	const serverTags: string[][] = json?.nip94_event?.tags || [];
	for (const t of serverTags) {
		if (Array.isArray(t) && t.length >= 2 && !exclude.has(t[0])) {
			tags.push([t[0], t[1]]);
		}
	}

	return { url, sha256, tags };
}

// Upload to a Blossom server
export async function blossomUpload(
	file: File,
	opts?: {
		server?: string;
		alt?: string;
		includeMimeTag?: boolean;
		includeDimensions?: boolean;
	}
): Promise<UploadResult> {
	const server = opts?.server ?? DEFAULT_SERVER;
	const sha256 = await sha256HexFile(file);

	// Blossom upload endpoint: PUT /:sha256
	const uploadUrl = `${server.replace(/\/$/, '')}/${sha256}`;
	const authorization = await makeNip98AuthHeader(uploadUrl, 'PUT', sha256);

	const res = await fetch('https://proxy.nuts.cash?url=' + uploadUrl, {
		method: 'PUT',
		headers: {
			Authorization: authorization,
			'Content-Type': file.type || 'application/octet-stream'
		},
		body: file
	});

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Blossom upload failed with status ${res.status}: ${text}`);
	}

	// Blossom returns the blob descriptor
	const json = await res.json().catch(() => null as any);

	// Construct the URL from the server response or use the upload URL
	const url = json?.url || uploadUrl;

	// Build NIP-94 tags
	const tags = await buildNip94Tags(file, sha256, url, opts);

	return { url, sha256, tags };
}

// Get the user's preferred upload configuration
export function getUserUploadConfig():
	| { type: 'blossom'; servers: string[] }
	| { type: 'nip96'; servers: string[] }
	| null {
	return get(preferredUploadServer);
}

// Get all configured servers (for fallback)
export function getAllUserServers(): string[] {
	const blossom = get(blossomServers);
	const nip96 = get(nip96Servers);
	return [...blossom, ...nip96];
}

// Smart upload that uses user's preferred server type
export async function uploadFile(
	file: File,
	opts?: {
		server?: string;
		serverType?: 'blossom' | 'nip96';
		alt?: string;
		includeMimeTag?: boolean;
		includeDimensions?: boolean;
		preferUserServers?: boolean; // If true, use user's configured servers
	}
): Promise<UploadResult> {
	const preferUserServers = opts?.preferUserServers ?? true;

	// Determine server type and URL
	let serverType = opts?.serverType;
	let serverUrl = opts?.server;

	if (preferUserServers && !serverUrl) {
		const userConfig = getUserUploadConfig();
		if (userConfig) {
			serverType = userConfig.type;
			serverUrl = userConfig.servers[0]; // Use first configured server
		}
	}

	// Fallback to defaults
	if (!serverUrl) {
		serverUrl = DEFAULT_SERVER;
	}
	if (!serverType) {
		// Default to Blossom
		serverType = 'blossom';
	}

	// Attempt upload
	if (serverType === 'blossom') {
		try {
			return await blossomUpload(file, { ...opts, server: serverUrl });
		} catch (e) {
			console.warn('Blossom upload failed, trying fallback:', e);
			// Try NIP-96 as fallback
			return await nip96Upload(file, { ...opts, server: serverUrl });
		}
	} else {
		return await nip96Upload(file, { ...opts, server: serverUrl });
	}
}
