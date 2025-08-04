import { handler } from './build/handler.js';
import express from 'express';

const app = express();

// Helper function to set security headers
const setSecurityHeaders = (res, pathname) => {
	console.log('📦 Serving file:', pathname);

	// Set COOP/COEP headers for all assets to enable SharedArrayBuffer
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

	// Add CORP headers for WASM files, workers, and JS files
	if (pathname.match(/\.(wasm|js)$/) || pathname.includes('worker')) {
		res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
		console.log('🔒 Added CORP header for:', pathname);
	}
};

// 1. Serve build artifacts from /_app/ (this is where your worker files are!)
app.use(
	'/_app',
	express.static('build/client/_app', {
		setHeaders: (res, pathname) => setSecurityHeaders(res, '/_app' + pathname)
	})
);

// 2. Serve static files from root (favicon, robots.txt, etc.)
app.use(
	express.static('static', {
		setHeaders: (res, pathname) => setSecurityHeaders(res, pathname)
	})
);

// 3. Handle all SvelteKit routes
app.use(handler);

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
	console.log(`🚀 NutsCash server running on http://${host}:${port}`);
});
