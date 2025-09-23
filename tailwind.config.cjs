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
					'primary-content': '#d6e9e5',
					secondary: '#D926AA',
					'secondary-content': '#c1cad6',
					'base-100': '#f9fafb',
					'base-200': '#f2f2f3',
					'base-300': '#dddcdc',
					'error-content': '#d9c2c2',
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
					accent: '#c19bfd',
					neutral: '#2a323c',
					info: '#00b5ff',
					success: '#00a96e',
					warning: '#ffbe00',
					error: '#ff5861'
				}
			}
		]
	},
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Suisse Int'l", 'ui-sans-serif', 'system-ui']
			}
		}
	},
	plugins: [require('daisyui')]
};
