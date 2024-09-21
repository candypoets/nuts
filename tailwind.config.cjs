/** @type {import('tailwindcss').Config} */
module.exports = {
	daisyui: {
		themes: [
			{
				light: {
					primary: '#158777',
					'primary-content': '#d6e9e5',
					secondary: '#D926AA',
					'base-100': '#f9fafb',
					'base-200': '#f2f2f3',
					neutral: '#2a323c',
					info: '#00b5ff',
					success: '#00a96e',
					warning: '#ffbe00',
					error: '#ff5861'
				},
				dark: {
					primary: '#a0ebd8',
					'primary-content': '#48505a',
					secondary: '#D926AA',
					'base-100': '#1d232a',
					neutral: '#2a323c',
					info: '#00b5ff',
					success: '#00a96e',
					warning: '#ffbe00',
					error: '#ff5861'
				}
				// light: {
				// 	primary: '#5C2EDD',
				// 	secondary: '#D926AA',
				// 	'base-100': '#1d232a',
				// 	neutral: '#2a323c',
				// 	info: '#00b5ff',
				// 	success: '#00a96e',
				// 	warning: '#ffbe00',
				// 	error: '#ff5861'
				// }
				// matrix: {
				// 	primary: '#020',
				// 	secondary: '#040',
				// 	'base-100': '#000',
				// 	neutral: '#EFE',
				// 	info: '#00b5ff',
				// 	success: '#00a96e',
				// 	warning: '#ffbe00',
				// 	error: '#ff5861',
				// 	fontFamily: 'm6x'
				// }
			}

			// 'emerald',
			// 'synthwave',
			// 'cyberpunk',
			// 'valentine',
			// 'halloween',
			// 'forest',
			// 'lofi',
			// 'wireframe',
			// 'black',
			// 'business',
			// 'acid',
			// 'winter'
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
