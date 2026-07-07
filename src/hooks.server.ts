import type { Handle } from '@sveltejs/kit';
import { LnutsHandler } from '@candypoets/lnuts';

// Initialize lnuts handler
const lnuts = new LnutsHandler();

// Export the lnuts handler as the main handler
export const handle: Handle = (input) => {
	if (input.event.url.pathname === '/login') {
		return Response.redirect(new URL('/explore/login', input.event.url), 307);
	}

	if (input.event.url.pathname === '/signup') {
		return Response.redirect(new URL('/explore/signup', input.event.url), 307);
	}

	return lnuts.handle(input);
};
