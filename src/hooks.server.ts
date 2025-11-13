import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import LnutsHandler from '@candypoets/lnuts';

// Initialize lnuts handler
const lnuts = new LnutsHandler();

// Middleware 1: Security Headers
const securityHeaders: Handle = async ({ event, resolve }) => {
	const { setHeaders, url } = event;

	console.log('🚀 Security headers middleware for:', url.pathname);

	const headers: Record<string, string> = {
		'Cross-Origin-Embedder-Policy': 'require-corp',
		'Cross-Origin-Opener-Policy': 'same-origin'
	};

	const isStaticAsset =
		url.pathname.includes('.wasm') ||
		url.pathname.includes('worker') ||
		url.pathname.includes('.js') ||
		url.pathname.includes('/static/') ||
		url.pathname.includes('/_app/');

	if (isStaticAsset) {
		headers['Cross-Origin-Resource-Policy'] = 'same-origin';
	}

	setHeaders(headers);

	return resolve(event, {
		filterSerializedResponseHeaders: (name) => {
			return (
				name === 'cross-origin-embedder-policy' ||
				name === 'cross-origin-opener-policy' ||
				name === 'cross-origin-resource-policy' ||
				name === 'content-type' ||
				name === 'cache-control'
			);
		},
		transformPageChunk: ({ html }) => {
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
};

// Middleware 2: Lnuts Handler
const lnutsHandler: Handle = lnuts.handle;

// Chain them using sequence
export const handle = sequence(securityHeaders, lnutsHandler);
