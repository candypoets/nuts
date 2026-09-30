import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { legalDocuments } from 'src/lib/server/legalContent';
import { legalPageResponse } from 'src/lib/server/legalPage';

// Full HTML responses bypass the client-only app shell and need no authentication.
export const GET: RequestHandler = ({ params }) => {
	const slug = params.document.replace(/\.html$/, '');
	if (!Object.hasOwn(legalDocuments, slug)) throw error(404, 'Page not found');
	if (params.document !== slug) throw redirect(308, `/legal/${slug}`);
	return legalPageResponse(slug as keyof typeof legalDocuments);
};
