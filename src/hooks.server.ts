import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const { setHeaders, url } = event;

	// Set COOP/COEP headers for SharedArrayBuffer support
	const headers: Record<string, string> = {
		'Cross-Origin-Embedder-Policy': 'require-corp',
		'Cross-Origin-Opener-Policy': 'same-origin'
	};

	// Add CORP headers for static assets (WASM files, workers, etc.)
	if (
		url.pathname.includes('.wasm') ||
		url.pathname.includes('worker') ||
		url.pathname.includes('.js') ||
		url.pathname.includes('/static/') ||
		url.pathname.includes('/_app/')
	) {
		headers['Cross-Origin-Resource-Policy'] = 'same-origin';
	}

	setHeaders(headers);

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
