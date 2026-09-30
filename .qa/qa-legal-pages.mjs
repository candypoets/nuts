// Run against a locally built production server; see docs/legal-publication-review.md.
import { launchBrowser, randomKey, browserAccount, seedSession } from './qa-lib.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
(async () => {
	const browser = await launchBrowser();
	const origin = (process.env.QA_BASE_URL || 'http://127.0.0.1:5297').replace(/\/$/, '');
	const screenshots = process.env.QA_SCREENSHOTS || '/tmp/nuts-legal-qa';
	mkdirSync(screenshots, { recursive: true });
	try {
		for (const width of [320, 390, 1440]) {
			const context = await browser.newContext({
				viewport: { width, height: 900 },
				javaScriptEnabled: false
			});
			const page = await context.newPage();
			const external = [];
			page.on('request', (req) => {
				if (!req.url().startsWith(origin)) external.push(req.url());
			});
			for (const slug of ['privacy', 'terms', 'support']) {
				const response = await page.goto(`${origin}/legal/${slug}`);
				assert.equal(response.status(), 200);
				assert.match(response.headers()['content-type'], /text\/html/);
				await page.locator('h1').waitFor();
				assert.match(await page.title(), /Nuts/);
				assert.ok(await page.locator('.draft').isVisible());
				const layout = await page.evaluate(() => ({
					width: innerWidth,
					scroll: document.documentElement.scrollWidth
				}));
				assert.ok(layout.scroll <= layout.width, `${slug} overflow at ${width}: ${layout.scroll}`);
				assert.equal(await page.locator('script').count(), 0);
				assert.equal((await page.reload()).status(), 200);
				if (width === 390 && slug === 'support')
					await page.screenshot({ path: join(screenshots, 'support-mobile.png'), fullPage: true });
				if (width === 1440 && slug === 'privacy')
					await page.screenshot({ path: join(screenshots, 'privacy-desktop.png') });
				if (width === 320 && slug === 'terms')
					await page.screenshot({ path: join(screenshots, 'terms-small.png') });
			}
			assert.deepEqual(external, []);
			await page
				.getByRole('navigation', { name: 'Legal pages', exact: true })
				.getByRole('link', { name: 'Privacy', exact: true })
				.click();
			assert.equal(new URL(page.url()).pathname, '/legal/privacy');
			console.log(
				`PASS: all pages, refresh, no JS, no external requests, no overflow, navigation at ${width}px`
			);
			await context.close();
		}
		const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(`${origin}/legal/support`);
		await page.getByRole('link', { name: 'Skip to content' }).focus();
		assert.ok(await page.getByRole('link', { name: 'Skip to content' }).isVisible());
		assert.deepEqual(errors, []);
		for (const slug of ['privacy', 'terms', 'support']) {
			const alias = await context.request.get(`${origin}/legal/${slug}.html`, { maxRedirects: 0 });
			assert.equal(alias.status(), 308);
			assert.equal(alias.headers().location, `/legal/${slug}`);
		}
		assert.equal((await context.request.get(`${origin}/legal/unknown`)).status(), 404);
		// Reject external traffic while checking the app's discoverable public footer.
		await page.route('**/*', (route) =>
			route.request().url().startsWith(origin) ? route.continue() : route.abort()
		);
		await page.goto(origin);
		const privacyLink = page
			.getByRole('navigation', { name: 'Legal and support' })
			.getByRole('link', { name: 'Privacy', exact: true });
		await privacyLink.waitFor({ timeout: 45000 });
		await privacyLink.click();
		await page.waitForURL('**/legal/privacy');
		await page.locator('h1').waitFor();
		assert.equal(await page.locator('script').count(), 0);
		console.log(
			'PASS: aliases, unknown route, keyboard skip link, landing footer -> standalone privacy page'
		);
		await context.close();
		for (const width of [390, 1440]) {
			const profileContext = await browser.newContext({ viewport: { width, height: 900 } });
			await profileContext.addInitScript(seedSession, browserAccount(randomKey()));
			const profilePage = await profileContext.newPage();
			await profilePage.route('**/*', (route) =>
				route.request().url().startsWith(origin) ? route.continue() : route.abort()
			);
			await profilePage.routeWebSocket('**/*', (socket) => socket.close());
			await profilePage.goto(origin + '/home/profile');
			const supportLink = profilePage
				.getByRole('navigation', { name: 'Legal and support' })
				.getByRole('link', { name: 'Support', exact: true });
			await supportLink.waitFor({ timeout: 20000 });
			await supportLink.click();
			await profilePage.waitForURL('**/legal/support');
			assert.equal(await profilePage.locator('h1').textContent(), 'Support');
			assert.equal(await profilePage.locator('script').count(), 0);
			console.log(`PASS: active profile-menu navigation at ${width}px`);
			await profileContext.close();
		}
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exit(1);
});
