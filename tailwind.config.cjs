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
				nuts: {
					primary: '#df725c',
					'primary-content': '#1b241f',
					secondary: '#e7b638',
					'secondary-content': '#17221d',
					'base-100': '#0b1712',
					'base-200': '#13251e',
					'base-300': '#1b3027',
					'base-content': '#f2ebdd',
					'error-content': '#fff4ed',
					highlight: '#263b32',
					accent: '#e7b638',
					neutral: '#22352d',
					info: '#79a9a0',
					success: '#79a66f',
					warning: '#e7b638',
					error: '#c95f50',
					'--shadow-outer-color': 'rgba(3, 12, 8, 0.48)',
					'--shadow-inset-highlight': 'rgba(242, 235, 221, 0.08)',
					'--shadow-inset-subtle': 'rgba(242, 235, 221, 0.025)'
				},
				touchgrass: {
					primary: '#158777',
					'primary-content': '#010806',
					secondary: '#D926AA',
					'secondary-content': '#160010',
					'base-100': '#f9fafb',
					'base-200': '#f2f2f3',
					'base-300': '#f8fdfd',
					'base-content': '#161617',
					'error-content': '#d9c2c2',
					highlight: '#ffffff',
					accent: '#6d28d9',
					neutral: '#2a323c',
					info: '#00b5ff',
					success: '#00a96e',
					warning: '#ffbe00',
					error: '#ff5861',
					// Custom shadow variables for light theme (subtle, higher contrast for light backgrounds)
					'--shadow-outer-color': 'rgba(0, 0, 0, 0.15)', // Softer black for light mode
					'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.3)', // Brighter inset
					'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.08)'
				},
				nightsky: {
					primary: '#0b5f52',
					'primary-content': '#f4fffc',
					secondary: '#b41488',
					'secondary-content': '#fff0fa',
					'base-100': '#131716',
					'base-200': '#1a1a1a',
					'base-300': '#1f2937',
					'base-content': '#f4f4f5',
					'text-gray-500': '#9b9ea4',
					highlight: '#000000',
					accent: '#c19bfd',
					neutral: '#2a323c',
					info: '#00b5ff',
					success: '#00a96e',
					warning: '#ffbe00',
					error: '#ff5861',
					// Custom shadow variables for dark theme (deeper shadows for dark backgrounds)
					'--shadow-outer-color': 'rgba(0, 0, 0, 0.5)', // Deeper black
					'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.1)', // Subdued inset
					'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.02)'
				},
				matteblack: {
					// Deep neutral blacks with just enough separation between canvas, chrome and cards
					primary: '#0b5f52',
					'primary-content': '#f4fffc',
					secondary: '#1c1c1c',
					'secondary-content': '#eeeeee',
					'base-100': '#080908',
					'base-200': '#101110',
					'base-300': '#181918',
					'base-content': '#f2f2f2',
					'error-content': '#ffd6d6',
					highlight: '#242524',
					accent: '#a855f7',
					neutral: '#111211',
					info: '#4d4d4d',
					success: '#006600', // Dark green
					warning: '#cc6600', // Dark orange
					error: '#990000', // Dark red
					'--shadow-outer-color': 'rgba(0, 0, 0, 0.78)',
					'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.045)',
					'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.01)'
				},
				snowwhite: {
					// snowwhite variant: Light theme with white bases and subtle cool tones for a clean, snowy vibe
					primary: '#158777',
					'primary-content': '#010806',
					secondary: '#d4d4d4',
					'secondary-content': '#343434',
					'base-100': '#e8e8e8',
					'base-200': '#f8f8f8',
					'base-300': '#ffffff',
					'base-content': '#1f1f20',
					'error-content': '#4d0000',
					highlight: '#d4d4d4',
					accent: '#3366ff',
					neutral: '#f0f0f0',
					info: '#99ddff',
					success: '#aaffaa',
					warning: '#ffdd99',
					error: '#ff9999',
					// Custom shadow variables for snowwhite (very light, subtle shadows for bright, snowy backgrounds)
					'--shadow-outer-color': 'rgba(0, 0, 0, 0.1)', // Very soft outer shadow to avoid harshness on white
					'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.4)', // Bright inset for a "glowing" snowy effect
					'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.1)' // Subtle inset for depth without darkening
				},
				downfox: {
					// Downfox variant: Another matte black take, perhaps with earthy tones (assuming "downfox" as a custom name; adjusted for muted, fox-like warm grays/blacks)
					primary: '#236f8f',
					'primary-content': '#f5fbff',
					secondary: '#282828',
					'secondary-content': '#f2f2f2',
					'base-100': '#00213f',
					'base-200': '#161616',
					'base-300': '#344159',
					'base-content': '#eff2f7',
					'error-content': '#b34700', // Warm muted error
					highlight: '#282828',
					accent: '#f7931a', // Bitcoin orange accent
					neutral: '#141414',
					info: '#336699',
					success: '#004d00',
					warning: '#996600',
					error: '#660000',
					// Custom shadow variables for downfox (warm-toned subtle shadows)
					'--shadow-outer-color': 'rgba(0, 0, 0, 0.65)', // Warm deep shadow
					'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.06)', // Minimal warm inset
					'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.012)'
				},
				sunset: {
					// Sunset Beach variant: Warm, tropical colors inspired by a beach at sunset with sandy bases, vibrant oranges, and ocean blues
					primary: '#e2553d', // Vibrant sunset orange
					'primary-content': '#1c0803', // Dark text that stays legible on primary and sand bases
					secondary: '#ffb347', // Soft peach secondary
					'secondary-content': '#3a2200',
					'base-100': '#f4e4bc', // Sandy beige background
					'base-200': '#e8d5a8', // Lighter sand
					'base-300': '#f7f2f3d9', // Deeper sand
					'base-content': '#241a13', // Sandy-dark text
					'error-content': '#8b0000', // Dark red for errors
					highlight: '#ffe4b5', // Light peach highlight
					accent: '#1e90ff', // Ocean blue accent
					neutral: '#daa520', // Golden neutral
					info: '#87ceeb', // Sky blue info
					success: '#32cd32', // Lime green success
					warning: '#ffa500', // Orange warning
					error: '#dc143c', // Crimson error
					// Custom shadow variables for sunsetbeach (warm, beachy shadows with a hint of glow)
					'--shadow-outer-color': 'rgba(255, 69, 0, 0.2)', // Warm orange-tinted shadow
					'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.2)', // Bright inset for sandy glow
					'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.05)'
				}

				// Add more "etc." themes here if needed, e.g., another variant:
				// midnightmatte: { ... similar structure ... }
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
					'0px 2px 3px 0px var(--shadow-outer-color), 0 1px 0 0 var(--shadow-inset-highlight) inset, 1px 0 0 0 var(--shadow-inset-subtle) inset, -1px 0 0 0 var(--shadow-inset-subtle) inset',
				'widget-down':
					'2px 2px 3px 0px var(--shadow-outer-color), 0 -1px 0 0 var(--shadow-inset-highlight) inset, 1px 0 0 0 var(--shadow-inset-subtle) inset, -1px 0 0 0 var(--shadow-inset-subtle) inset'
			}
		}
	},
	plugins: [require('daisyui'), require('@tailwindcss/typography')]
};
