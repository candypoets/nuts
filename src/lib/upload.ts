import { useSignEvent } from '@candypoets/nipworker/hooks';

export type Nip96UploadResult = {
	url: string;
	sha256: string;
	tags: string[][];
};

const DEFAULT_SERVER = 'https://nostr.build';

async function sha256HexFile(file: File): Promise<string> {
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

export async function nip96Upload(
	file: File,
	opts?: {
		server?: string;
		alt?: string;
		includeMimeTag?: boolean;
		includeDimensions?: boolean;
	}
): Promise<Nip96UploadResult> {
	const server = opts?.server ?? DEFAULT_SERVER;

	// Hash of raw file; also useful for NIP-94 x field (the editor infers it automatically)
	const sha256 = await sha256HexFile(file);

	const uploadUrl = await discoverNip96UploadUrl(server);
	const authorization = await makeNip98AuthHeader(uploadUrl, 'POST', sha256);

	const form = new FormData();
	form.append('file', file, file.name);

	const res = await fetch(uploadUrl, {
		method: 'POST',
		headers: { Authorization: authorization },
		body: form
	});

	const json = await res.json().catch(() => null as any);
	const url = extractUploadedUrl(json);

	if (!res.ok || !url) {
		throw new Error((json?.message as string) || `Upload failed with status ${res.status}`);
	}

	// Build additional NIP-94 tags for imeta
	const tags: string[][] = [];

	// alt text
	const alt = opts?.alt || file.name || '';
	if (alt) tags.push(['alt', alt]);

	// mime type (explicit override if you want to force it)
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
