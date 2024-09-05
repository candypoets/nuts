import { sveltekit } from '@sveltejs/kit/vite';
// import { VitePWA } from "vite-plugin-pwa";
import { SvelteKitPWA as VitePWA } from '@vite-pwa/sveltekit';

import { defineConfig } from 'vite';

const generateSW = true;

export default defineConfig({
	// WARN: this will not be necessary on your project
	logLevel: 'info',
	server: {
		fs: {
			// Allow serving files from hoisted root node_modules
			// allow: ['../..']
		}
	},
	plugins: [
		sveltekit(),
		// mkcert(),
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
				theme_color: '#fbf9fa',
				start_url: '/home',
				display: 'fullscreen',
				orientation: 'portrait',
				background_color: '#fbf9fa',
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
		}
	}
});
