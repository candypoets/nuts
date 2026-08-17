import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA as VitePWA } from '@vite-pwa/sveltekit';
import basicSsl from '@vitejs/plugin-basic-ssl';

import { defineConfig, loadEnv } from 'vite';
import { nipworkerWasmPlugin } from '@candypoets/nipworker/vite';
import { nipworkerRelayProxyPlugin } from '@candypoets/nipworker/proxy/vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), 'VITE_');
	const enableSsl = env.VITE_ENABLE_SSL === 'true';
	const disableHmr = env.VITE_DISABLE_HMR === 'true';

	return {
		ssr: {
			// noExternal: ['idb']
		},
		// WARN: this will not be necessary on your project
		logLevel: 'info',
		server: {
			host: true,
			allowedHosts: ['befree'],
			fs: {
				// Allow serving files from hoisted root node_modules
				allow: ['/']
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
			nipworkerWasmPlugin(),
			sveltekit(),
			// Only use nipworker proxy plugin in development (production uses src/server.ts)
			...(mode === 'development'
				? [nipworkerRelayProxyPlugin({ port: 7777, host: '0.0.0.0' })]
				: []),
			// nipworkerRelayProxyPlugin({ port: 7777, host: '0.0.0.0' }),
			VitePWA({
				devOptions: {
					enabled: true,
					navigateFallbackAllowlist: [/^index.html$/]
				},
				includeAssets: [
					'favicon.ico',
					'apple-touch-icon.png',
					'nuts-icon.svg',
					'nuts-icon-black.svg',
					'nuts-icon-white.svg'
				],
				manifest: {
					name: 'Nuts.cash',
					short_name: 'Nuts',
					description: 'The nostr cashu wallet',
					theme_color: '#000000',
					start_url: '/explore',
					display: 'standalone',
					orientation: 'portrait',
					background_color: '#000000',
					lang: 'en',
					categories: ['finance', 'utility'],
					icons: [
						{
							src: '/nuts-icon.svg',
							sizes: 'any',
							type: 'image/svg+xml'
						},
						{
							src: '/app-icon-192.png',
							sizes: '192x192',
							type: 'image/png',
							purpose: 'any'
						},
						{
							src: '/app-icon-512.png',
							sizes: '512x512',
							type: 'image/png',
							purpose: 'any'
						},
						{
							src: '/maskable-icon-512.png',
							sizes: '512x512',
							type: 'image/png',
							purpose: 'maskable'
						}
					]
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
