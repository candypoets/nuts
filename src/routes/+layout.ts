import type { Load } from '@sveltejs/kit';

// +layout.js or +layout.ts
export const load: Load = async ({ url }) => {
	console.log('layout', url);
	if (url.pathname === '/') {
		console.log('redirecting');
		return {
			status: 302,
			redirect: '/home'
		};
	}
	return {};
};
