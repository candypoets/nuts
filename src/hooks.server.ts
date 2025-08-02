import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const { setHeaders, url } = event;

	// Debug logging
	console.log('🚀 Server hook executed for:', url.pathname);
	console.log('🔍 Method:', event.request.method);

	// Set COOP/COEP headers for SharedArrayBuffer support - ALWAYS set these
	const headers: Record<string, string> = {
		'Cross-Origin-Embedder-Policy': 'require-corp',
		'Cross-Origin-Opener-Policy': 'same-origin'
	};

	// Add CORP headers for static assets (WASM files, workers, etc.)
	if (
		url.pathname.includes('.wasm') ||
		url.pathname.includes('worker') ||
		url.pathname.includes('.js') ||
		url.pathname.includes('.css') ||
		url.pathname.includes('.map') ||
		url.pathname.includes('/static/') ||
		url.pathname.includes('/_app/') ||
		url.pathname.includes('/immutable/')
	) {
		headers['Cross-Origin-Resource-Policy'] = 'same-origin';
		console.log('📦 Adding CORP header for static asset:', url.pathname);
	}

	// Set headers immediately
	setHeaders(headers);
	console.log('🏷️  Headers set for', url.pathname, ':', Object.keys(headers));

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			// Ensure HTML has proper meta tags for COOP/COEP
			if (html.includes('<head>') && !html.includes('Cross-Origin-Embedder-Policy')) {
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

	return response;
};
