// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { legalDocuments } from './legalContent';
import { contactHref, legalPageResponse } from './legalPage';
import { GET } from '../../routes/legal/[document]/+server';

describe('public legal documents', () => {
	it.each(['privacy', 'terms', 'support'] as const)(
		'serves %s as complete accessible HTML without app scripts or authentication',
		async (slug) => {
			const response = legalPageResponse(slug);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
			expect(response.headers.get('set-cookie')).toBeNull();
			const document = new DOMParser().parseFromString(await response.text(), 'text/html');
			expect(document.title).toBe(`${legalDocuments[slug].title} · Nuts`);
			expect(document.querySelector('h1')?.textContent).toBe(legalDocuments[slug].title);
			expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
				`https://nuts.cash/legal/${slug}`
			);
			expect(document.querySelectorAll('script, iframe, form').length).toBe(0);
			expect(
				document.querySelector('meta[name="viewport"]')?.getAttribute('content')
			).not.toContain('user-scalable=no');
			for (const anchor of document.querySelectorAll('a[href^="#"]')) {
				expect(document.getElementById(anchor.getAttribute('href')!.slice(1))).not.toBeNull();
			}
			for (const target of Object.keys(legalDocuments)) {
				expect(document.querySelector(`a[href="/legal/${target}"]`)).not.toBeNull();
			}
			for (const subject of ['Nuts support', 'Nuts privacy request', 'Nuts abuse report']) {
				expect(
					Array.from(document.querySelectorAll('a'), (anchor) => anchor.getAttribute('href'))
				).toContain(contactHref(subject));
			}
			// Publication must not silently strip the unresolved review status.
			expect(response.headers.get('x-robots-tag')).toContain('noindex');
			expect(document.querySelector('.draft')?.textContent).toContain('operator review required');
			expect(document.querySelector('.meta')?.textContent).toContain('No effective date');
		}
	);

	it('encodes email subjects without changing the supplied contact', () => {
		const url = new URL(contactHref('Nuts abuse report'));
		expect(url.pathname).toBe('thib.duchene@gmail.com');
		expect(url.searchParams.get('subject')).toBe('Nuts abuse report');
	});

	it.each(['privacy', 'terms', 'support'])(
		'supports direct route requests for %s',
		async (slug) => {
			const response = await GET({ params: { document: slug } } as Parameters<typeof GET>[0]);
			expect(response.status).toBe(200);
		}
	);

	it.each(['privacy', 'terms', 'support'])('redirects the draft %s.html URL', (slug) => {
		expect(() =>
			GET({ params: { document: `${slug}.html` } } as Parameters<typeof GET>[0])
		).toThrow(expect.objectContaining({ status: 308, location: `/legal/${slug}` }));
	});

	it.each(['unknown', 'toString', '__proto__'])('rejects unknown document %s', (slug) => {
		expect(() => GET({ params: { document: slug } } as Parameters<typeof GET>[0])).toThrow(
			expect.objectContaining({ status: 404 })
		);
	});
});
