import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const { setHeaders, url } = event;

	console.log('🚀 Server hook executed for:', url.pathname);
	console.log('🔍 Method:', event.request.method);

	// Set COOP/COEP headers for SharedArrayBuffer support
	const headers: Record<string, string> = {
		'Cross-Origin-Embedder-Policy': 'require-corp',
		'Cross-Origin-Opener-Policy': 'same-origin'
	};

	// Add CORP headers for static assets (WASM files, workers, etc.)
	const isStaticAsset =
		url.pathname.includes('.wasm') ||
		url.pathname.includes('worker') ||
		url.pathname.includes('.js') ||
		url.pathname.includes('/static/') ||
		url.pathname.includes('/_app/');

	if (isStaticAsset) {
		headers['Cross-Origin-Resource-Policy'] = 'same-origin';
		console.log('📦 Adding CORP header for static asset:', url.pathname);
	}

	setHeaders(headers);
	console.log('🏷️  Headers set for', url.pathname, ':', Object.keys(headers));

	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => {
			// Ensure our security headers are preserved for static assets
			return (
				name === 'cross-origin-embedder-policy' ||
				name === 'cross-origin-opener-policy' ||
				name === 'cross-origin-resource-policy' ||
				name === 'content-type' ||
				name === 'cache-control'
			);
		},
		transformPageChunk: ({ html }) => {
			// Ensure HTML has proper meta tags for COOP/COEP
			if (html.includes('<head>') && !html.includes('Cross-Origin-Embedder-Policy')) {
				console.log('🔧 Transforming HTML to add COOP/COEP meta tags');
				return html.replace(
					'<head>',
					`<head>
					<meta http-equiv="Cross-Origin-Embedder-Policy" content="require-corp">
					<meta http-equiv="Cross-Origin-Opener-Policy" content="same-origin">`
				);
			}
			return html;
		}
	});

	// Log response headers for debugging
	console.log(
		'📤 Response headers for',
		url.pathname,
		':',
		Array.from(response.headers.entries()).map(([k, v]) => `${k}: ${v}`)
	);

	console.log('✅ Response status:', response.status);
	return response;
};
