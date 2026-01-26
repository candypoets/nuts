import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { SvelteKitPWA as VitePWA } from '@vite-pwa/sveltekit';

import { defineConfig, loadEnv } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import { visualizer } from 'rollup-plugin-visualizer';
import compression from 'vite-plugin-compression';
import path from 'path';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), 'VITE_');
	const enableSsl = env.VITE_ENABLE_SSL === 'true';

	return {
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
			assetsInlineLimit: 0,
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
			...(enableSsl ? [basicSsl()] : []),
			topLevelAwait(),
			// sharedArrayBufferPlugin(), // Add our custom plugin
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
					start_url: '/explore',
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
					maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
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
			// compression({
			// 	verbose: true,
			// 	algorithm: 'gzip',
			// 	threshold: 1024,
			// 	filter: /\.(js|mjs|json|css|html|wasm|svg|jpg|jpeg|png|gif)$/i,
			// 	deleteOriginFile: false
			// }),
			// compression({
			// 	verbose: true,
			// 	algorithm: 'brotliCompress',
			// 	threshold: 1024,
			// 	filter: /\.(js|mjs|json|css|html|wasm|svg|jpg|jpeg|png|gif)$/i,
			// 	deleteOriginFile: false
			// })
		],
		resolve: {
			alias: {
				src: ['/src']
				// '@cashu/cashu-ts': path.resolve(__dirname, '../cashu-ts/src'),
				// '@candypoets/lnuts': path.resolve(__dirname, '../lnuts/src')
			}
		}
	};
});
