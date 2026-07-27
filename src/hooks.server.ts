import type { Handle } from '@sveltejs/kit';
import { LnutsHandler } from '@candypoets/lnuts';
import { getPostPreview, neventFromPath, renderPostPreviewHead } from 'src/lib/server/postPreview';

// Initialize lnuts handler
const lnuts = new LnutsHandler();

// Export the lnuts handler as the main handler
export const handle: Handle = async (input) => {
	if (input.event.url.pathname === '/login') {
		return Response.redirect(new URL('/explore/login', input.event.url), 307);
	}

	if (input.event.url.pathname === '/signup') {
		return Response.redirect(new URL('/explore/signup', input.event.url), 307);
	}

	const nevent =
		input.event.request.method === 'GET' ? neventFromPath(input.event.url.pathname) : null;
	const [response, preview] = await Promise.all([
		lnuts.handle(input),
		nevent ? getPostPreview(nevent) : Promise.resolve(null)
	]);
	if (
		!nevent ||
		!response.headers.get('content-type')?.includes('text/html') ||
		response.headers.has('content-encoding')
	) {
		return response;
	}

	const html = await response.text();
	const closingHead = html.indexOf('</head>');
	if (closingHead === -1) return response;

	const previewHead = renderPostPreviewHead(preview, input.event.url);
	const headers = new Headers(response.headers);
	headers.delete('content-length');
	return new Response(`${html.slice(0, closingHead)}${previewHead}\n${html.slice(closingHead)}`, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
};
