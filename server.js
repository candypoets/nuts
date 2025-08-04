import { handler } from './build/handler.js';
import express from 'express';

const app = express();

// Helper function to set security headers
const setSecurityHeaders = (res, pathname) => {
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

	if (pathname.match(/\.(wasm|js)$/) || pathname.includes('worker')) {
		res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
	}
};

// Serve build artifacts from /_app/
app.use(
	'/_app',
	express.static('build/client/_app', {
		setHeaders: (res, pathname) => setSecurityHeaders(res, pathname)
	})
);

// Serve other build client files
app.use(
	express.static('build/client', {
		setHeaders: (res, pathname) => setSecurityHeaders(res, pathname)
	})
);

// Serve static files from static folder
app.use(
	express.static('static', {
		setHeaders: (res, pathname) => setSecurityHeaders(res, pathname)
	})
);

// Handle all SvelteKit routes
app.use(handler);

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
	console.log(`🚀 NutsCash server running on http://${host}:${port}`);
});
