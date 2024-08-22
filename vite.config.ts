import { sveltekit } from '@sveltejs/kit/vite';
// import { VitePWA } from "vite-plugin-pwa";
import { SvelteKitPWA as VitePWA } from '@vite-pwa/sveltekit';

import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

const generateSW = true;

export default defineConfig({
	// WARN: this will not be necessary on your project
	logLevel: 'info',
	server: {
		// https: mkcert,
		fs: {
			// Allow serving files from hoisted root node_modules
			allow: ['../..']
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
			includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
			manifest: {
				name: 'Nuts.cash',
				short_name: 'nuts',
				description: 'The Ecash social wallet',
				theme_color: '#fbf9fa',
				start_url: '/',
				display: 'fullscreen',
				orientation: 'portrait',
				background_color: '#fbf9fa'
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
			// ["ethers/lib/utils"]: ["ethers/lib/utils.js"]
		}
	}
});
