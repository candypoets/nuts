import {
	legalContact,
	legalDocuments,
	legalReviewPending,
	type LegalDocument
} from './legalContent';

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!;
	});
}

export function contactHref(subject: string): string {
	return `mailto:${legalContact}?subject=${encodeURIComponent(subject)}`;
}

export function renderLegalPage(slug: keyof typeof legalDocuments): string {
	const document: LegalDocument = legalDocuments[slug];
	const nav = Object.entries(legalDocuments)
		.map(
			([key, page]) =>
				`<a href="/legal/${key}"${key === slug ? ' aria-current="page"' : ''}>${escapeHtml(page.label)}</a>`
		)
		.join('');
	const sections = document.sections
		.map(
			(section) => `<section aria-labelledby="${section.id}">
<h2 id="${section.id}">${escapeHtml(section.title)}</h2>
${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
</section>`
		)
		.join('\n');
	const contacts = [
		['Get support', 'Nuts support', 'Questions about the website, app or a payment.'],
		['Privacy request', 'Nuts privacy request', 'Questions about your information or deletion.'],
		['Report abuse', 'Nuts abuse report', 'Include a public link or event/profile identifier.']
	]
		.map(
			([label, subject, description]) => `<a class="contact-card" href="${contactHref(subject)}">
<strong>${label}<span aria-hidden="true"> ↗</span></strong><span>${description}</span></a>`
		)
		.join('\n');

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f2ebdd">
${legalReviewPending ? '<meta name="robots" content="noindex, nofollow">' : ''}
<title>${escapeHtml(document.title)} · Nuts</title>
<meta name="description" content="${escapeHtml(document.intro)}">
<link rel="canonical" href="https://nuts.cash/legal/${slug}">
<link rel="icon" href="/nuts-icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/legal.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<a class="brand" href="/" aria-label="Nuts home"><img src="/nuts-icon.svg" width="44" height="44" alt=""><span>Nuts</span></a>
<nav aria-label="Legal pages">${nav}</nav>
<a class="open-app" href="/explore">Explore Nuts <span aria-hidden="true">↗</span></a>
</header>
<main id="main" tabindex="-1">
<div class="hero"><p class="eyebrow">People. Community. Trust.</p>
<h1>${escapeHtml(document.title)}</h1>
<p class="intro">${escapeHtml(document.intro)}</p>
<p class="meta">DUCHENE SARL${legalReviewPending ? ' · Draft for review · No effective date' : ''}</p></div>
${legalReviewPending ? '<aside class="draft" aria-label="Draft status"><strong>Draft — operator review required</strong><p>This is not a finalized policy or terms of service. Retention, provider arrangements and native iOS practices still need confirmation. Do not use this draft for App Store submission.</p></aside>' : ''}
<div class="document-layout">
<nav class="contents" aria-label="On this page"><p>On this page</p>${document.sections.map((section) => `<a href="#${section.id}">${escapeHtml(section.title)}</a>`).join('')}</nav>
<article>${sections}</article>
</div>
<section class="contact" aria-labelledby="contact-heading"><p class="eyebrow">We’re here to listen</p><h2 id="contact-heading">Let’s talk.</h2>
<p>Support, privacy and abuse contact: <a href="${contactHref('Nuts support')}">${legalContact}</a></p>
<div class="contact-grid">${contacts}</div></section>
</main>
<footer><a class="brand" href="/">Nuts</a><p>Made for belonging.</p><address>DUCHENE SARL<br>7 route de Mamer, Holzem</address><nav aria-label="Footer">${nav}</nav></footer>
</body>
</html>`;
}

export function legalPageResponse(slug: keyof typeof legalDocuments): Response {
	return new Response(renderLegalPage(slug), {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-cache',
			'content-security-policy':
				"default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
			'referrer-policy': 'no-referrer',
			'x-content-type-options': 'nosniff',
			...(legalReviewPending ? { 'x-robots-tag': 'noindex, nofollow' } : {})
		}
	});
}
