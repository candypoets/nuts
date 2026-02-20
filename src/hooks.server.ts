import type { Handle } from '@sveltejs/kit';
import { LnutsHandler } from '@candypoets/lnuts';

// Initialize lnuts handler
const lnuts = new LnutsHandler();

// Export the lnuts handler as the main handler
export const handle: Handle = lnuts.handle;
