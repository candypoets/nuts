import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { SvelteKitPWA as VitePWA } from '@vite-pwa/sveltekit';

import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';

// Custom plugin to handle SharedArrayBuffer headers for preview mode
const sharedArrayBufferPlugin = () => {
	return {
		name: 'shared-array-buffer-headers',
		configurePreviewServer(server) {
			server.middlewares.use((req, res, next) => {
				// Set headers for all requests
				res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
				res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

				// Set CORP headers for static assets
				if (
					req.url?.includes('.wasm') ||
					req.url?.includes('worker') ||
					req.url?.includes('.js') ||
					req.url?.includes('/static/') ||
					req.url?.includes('/_app/')
				) {
					res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
				}

				next();
			});
		}
	};
};

// Custom plugin to handle SharedArrayBuffer headers for @fs routes

export default defineConfig({
	ssr: {
		// noExternal: ['idb']
	},
	// WARN: this will not be necessary on your project
	logLevel: 'info',
	server: {
		proxy: {},
		host: true,
		fs: {
			// Allow serving files from hoisted root node_modules
			allow: ['..']
		},
		headers: {
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Resource-Policy': 'cross-origin'
		}
	},
	build: {
		target: 'es2022',
		rollupOptions: {
			output: {
				format: 'es'
			}
		}
	},
	optimizeDeps: {
		exclude: ['@candypoets/nipworker']
	},
	plugins: [
		basicSsl(),
		topLevelAwait(),
		sharedArrayBufferPlugin(), // Add our custom plugin
		sveltekit(),
		VitePWA({
			devOptions: {
				enabled: true,
				navigateFallbackAllowlist: [/^index.html$/]
			},
			includeAssets: ['favicon.ico', 'touch-icon-180.png', 'ns-naked.svg'],
			manifest: {
				name: 'Nuts.cash',
				short_name: 'Nuts',
				description: 'The nostr cashu wallet',
				theme_color: 'transparent',
				start_url: '/home',
				display: 'standalone',
				orientation: 'portrait',
				background_color: 'transparent',
				lang: 'en',
				categories: ['finance', 'utility']
				// permissions: ['camera']
			},
			registerType: 'autoUpdate',
			workbox: {
				cleanupOutdatedCaches: true,
				runtimeCaching: [
					{
						urlPattern: ({ request }) =>
							request.destination === 'document' ||
							request.destination === 'script' ||
							request.destination === 'style',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'dynamic-cache',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
							}
						}
					}
				]
			}
		})
	],
	resolve: {
		alias: {
			src: ['/src']
			// '@cashu/cashu-ts': path.resolve(__dirname, '../cashu-ts/src')
		}
	}
});
