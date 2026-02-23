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
				touchgrass: {
					primary: '#158777',
					'primary-content': '#9b9ea4',
					secondary: '#D926AA',
					'secondary-content': '#c1cad6',
					'base-100': '#f9fafb',
					'base-200': '#f2f2f3',
					'base-300': '#f8fdfd',
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
					error: '#ff5861',
					// Custom shadow variables for dark theme (deeper shadows for dark backgrounds)
					'--shadow-outer-color': 'rgba(0, 0, 0, 0.5)', // Deeper black
					'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.1)', // Subdued inset
					'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.02)'
				},
				matteblack: {
					// Base matte black theme: dark, muted, low-contrast colors for a sleek, non-glossy look
					primary: '#1fb092',
					// primary: '#262626',
					'primary-content': '#a0a0a0', // Muted gray for text on primary
					secondary: '#333333', // Dark gray secondary
					'secondary-content': '#b0b0b0',
					'base-100': '#333333', // Almost black background (updated)
					'base-200': '#1a1a1a',
					'base-300': '#262626',
					'error-content': '#cc0000', // Muted red for errors
					highlight: '#333333', // Subtle highlight
					accent: '#a855f7', // Muted accent (updated)
					neutral: '#1a1a1a',
					info: '#4d4d4d',
					success: '#006600', // Dark green
					warning: '#cc6600', // Dark orange
					error: '#990000', // Dark red
					// Custom shadow variables for matteblack (very subtle, low-contrast shadows)
					'--shadow-outer-color': 'rgba(0, 0, 0, 0.6)', // Deep matte shadow
					'--shadow-inset-highlight': 'rgba(255, 255, 255, 0.05)', // Minimal inset
					'--shadow-inset-subtle': 'rgba(255, 255, 255, 0.01)'
				},
				snowwhite: {
					// snowwhite variant: Light theme with white bases and subtle cool tones for a clean, snowy vibe
					primary: '#158777',
					'primary-content': '#e0e0e0',
					secondary: '#d4d4d4',
					'secondary-content': '#343434',
					'base-100': '#e8e8e8',
					'base-200': '#f8f8f8',
					'base-300': '#ffffff',
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
					primary: '#ADD8E6',
					'primary-content': '#999999',
					secondary: '#282828',
					'secondary-content': '#b3b3b3',
					'base-100': '#00213f',
					'base-200': '#161616',
					'base-300': '#3441597a',
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
					primary: '#ff6347', // Vibrant sunset orange
					'primary-content': '#f5f5dc', // Beige text on primary
					secondary: '#ffb347', // Soft peach secondary
					'secondary-content': '#4a4a4a',
					'base-100': '#f4e4bc', // Sandy beige background
					'base-200': '#e8d5a8', // Lighter sand
					'base-300': '#f7f2f3d9', // Deeper sand
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
	plugins: [require('daisyui')]
};
