import { handler } from './build/handler.js';
import express from 'express';

const app = express();

// Log ALL requests to see what's happening
app.use((req, res, next) => {
	console.log(`🌐 Request: ${req.method} ${req.url}`);
	next();
});

// Helper function to set security headers
const setSecurityHeaders = (res, pathname) => {
	console.log('📦 Express serving file:', pathname);

	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

	if (pathname.match(/\.(wasm|js)$/) || pathname.includes('worker')) {
		res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
		console.log('🔒 Added CORP header for:', pathname);
	}
};

// Static file serving
app.use(
	'/_app',
	express.static('build/client/_app', {
		setHeaders: (res, pathname) => setSecurityHeaders(res, pathname)
	})
);

app.use(
	express.static('build/client', {
		setHeaders: (res, pathname) => setSecurityHeaders(res, pathname)
	})
);

app.use(
	express.static('static', {
		setHeaders: (res, pathname) => setSecurityHeaders(res, pathname)
	})
);

// Custom handler wrapper to add headers to SvelteKit responses
app.use((req, res, next) => {
	// If it's a worker file that made it to SvelteKit
	if (req.url.includes('worker') || req.url.includes('/_app/')) {
		console.log('🎯 SvelteKit handling:', req.url);

		// Override res.setHeader to add our headers
		const originalSetHeader = res.setHeader;
		res.setHeader = function (name, value) {
			originalSetHeader.call(this, name, value);

			// Add our security headers
			if (!res.headersSent) {
				originalSetHeader.call(this, 'Cross-Origin-Embedder-Policy', 'require-corp');
				originalSetHeader.call(this, 'Cross-Origin-Opener-Policy', 'same-origin');
				if (req.url.match(/\.(wasm|js)$/) || req.url.includes('worker')) {
					originalSetHeader.call(this, 'Cross-Origin-Resource-Policy', 'same-origin');
					console.log('🔒 Added CORP header via SvelteKit for:', req.url);
				}
			}
		};
	}

	handler(req, res, next);
});

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
	console.log(`🚀 NutsCash server running on http://${host}:${port}`);
});
