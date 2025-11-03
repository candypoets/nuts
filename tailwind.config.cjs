/** @type {import('tailwindcss').Config} */
module.exports = {
	safelist: [
		'grid-cols-1',
		'grid-cols-2',
		'grid-cols-3',
		'grid-cols-4',
		'grid-cols-5',
		'grid-cols-6',
		'grid-cols-7',
		'grid-cols-8',
		'col-span-1',
		'col-span-2',
		'col-span-3',
		'col-span-4',
		'col-span-5',
		'!hidden'
	],
	daisyui: {
		themes: [
			{
				light: {
					primary: '#158777',
					'primary-content': '#9b9ea4',
					secondary: '#D926AA',
					'secondary-content': '#c1cad6',
					'base-100': '#f9fafb',
					'base-200': '#f2f2f3',
					'base-300': '#cdede9',
					'error-content': '#d9c2c2',
					highlight: '#ffffff',
					accent: '#6d28d9',
					neutral: '#2a323c',
					info: '#00b5ff',
					success: '#00a96e',
					warning: '#ffbe00',
					error: '#ff5861'
				},
				dark: {
					primary: '#1fb092',
					'primary-content': '#48505a',
					secondary: '#D926AA',
					'secondary-content': '#c1cad6',
					'base-100': '#131716',
					'base-300': '#1f2937',
					'text-gray-500': '#9b9ea4',
					highlight: '#000000',
					accent: '#c19bfd',
					neutral: '#2a323c',
					info: '#00b5ff',
					success: '#00a96e',
					warning: '#ffbe00',
					error: '#ff5861'
				},
				matteblack: {
					// Base matte black theme: dark, muted, low-contrast colors for a sleek, non-glossy look
					primary: '#1a1a1a', // Deep matte black
					'primary-content': '#a0a0a0', // Muted gray for text on primary
					secondary: '#333333', // Dark gray secondary
					'secondary-content': '#b0b0b0',
					'base-100': '#3b3b3b', // Almost black background
					'base-200': '#1a1a1a',
					'base-300': '#262626',
					'error-content': '#cc0000', // Muted red for errors
					highlight: '#333333', // Subtle highlight
					accent: '#4d4d4d', // Muted accent
					neutral: '#1a1a1a',
					info: '#4d4d4d',
					success: '#006600', // Dark green
					warning: '#cc6600', // Dark orange
					error: '#990000' // Dark red
				},
				zedokai: {
					// Zedokai variant: Inspired by code editor dark themes (e.g., Zed-like), matte black with subtle blues/grays for a focused, developer-friendly vibe
					primary: '#0f0f0f',
					'primary-content': '#b3b3b3',
					secondary: '#2b2b2b',
					'secondary-content': '#cccccc',
					'base-100': '#080808',
					'base-200': '#121212',
					'base-300': '#1e1e1e',
					'error-content': '#b30000',
					highlight: '#2b2b2b',
					accent: '#004d99', // Subtle blue accent for highlights/code
					neutral: '#0f0f0f',
					info: '#0066cc',
					success: '#005500',
					warning: '#b35900',
					error: '#800000'
				},
				downfox: {
					// Downfox variant: Another matte black take, perhaps with earthy tones (assuming "downfox" as a custom name; adjusted for muted, fox-like warm grays/blacks)
					primary: '#141414',
					'primary-content': '#999999',
					secondary: '#282828',
					'secondary-content': '#b3b3b3',
					'base-100': '#0a0a0a',
					'base-200': '#161616',
					'base-300': '#222222',
					'error-content': '#b34700', // Warm muted error
					highlight: '#282828',
					accent: '#663300', // Earthy brown accent
					neutral: '#141414',
					info: '#336699',
					success: '#004d00',
					warning: '#996600',
					error: '#660000'
				}
			}
		]
	},
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Suisse Int'l", 'ui-sans-serif', 'system-ui']
			},
			boxShadow: {
				widget:
					'0px 20px 30px 0px rgba(0, 0, 0, 0.30), 0 1px 0 0 rgba(255, 255, 255, 0.2) inset, 1px 0 0 0 rgba(255, 255, 255, 0.04) inset, -1px 0 0 0 rgba(255, 255, 255, 0.04) inset',
				'widget-down':
					'12px 20px 30px 0px rgba(0, 0, 0, 0.30), 0 -1px 0 0 rgba(255, 255, 255, 0.2) inset, 1px 0 0 0 rgba(255, 255, 255, 0.04) inset, -1px 0 0 0 rgba(255, 255, 255, 0.04) inset'
			}
		}
	},
	plugins: [require('daisyui')]
};
