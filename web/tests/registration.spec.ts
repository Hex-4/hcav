import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
	type APIRequestContext,
	type Browser,
	type BrowserContext,
	expect,
	type Page,
	test
} from '@playwright/test';

const app = 'http://localhost:5174';
const state = () =>
	JSON.parse(readFileSync('../.amp/in/test-providers.json', 'utf8')) as {
		people: { id: string; name: string; team_id?: string }[];
		teams: { id: string; name: string; captain_id: string; link_token: string }[];
		mail: { recipient: string; body: string; status: string }[];
		slack: { channel: string; text: string; mrkdwn: boolean }[];
	};

async function signIn(request: APIRequestContext, actor: string, fault = '', next = '/team') {
	const start = await request.get(`/auth/login?next=${encodeURIComponent(next)}`, {
		maxRedirects: 0
	});
	expect(start.status()).toBe(303);
	const authorize = new URL(start.headers().location);
	expect(authorize.origin).toBe('https://auth.hackclub.com');
	expect(authorize.searchParams.get('scope')).toBe(
		'openid profile email slack_id verification_status'
	);
	const code = Buffer.from(
		JSON.stringify({ actor, nonce: authorize.searchParams.get('nonce'), fault })
	).toString('base64url');
	return request.get(
		`/auth/callback?${new URLSearchParams({ code, state: authorize.searchParams.get('state') || '' })}`,
		{ maxRedirects: 0 }
	);
}

const post = (request: APIRequestContext, form: Record<string, string>, path = '/team') =>
	request.post(path, { form, headers: { Origin: app, Accept: 'text/html' }, maxRedirects: 0 });
const create = (request: APIRequestContext, name: string) =>
	post(request, { action: 'create', name });
async function actorContext(browser: Browser, name: string) {
	const context = await browser.newContext({ baseURL: app });
	expect((await signIn(context.request, name)).status()).toBe(303);
	return context;
}

async function capture(page: Page, name: string) {
	await expect(page.locator('body')).toHaveCSS(
		'font-family',
		'"comic neue", "Comic Sans MS", cursive'
	);
	expect(
		await page.evaluate(async () => {
			const faces = await Promise.all(
				[400, 700].map((weight) => document.fonts.load(`${weight} 18px "comic neue"`))
			);
			return faces.every((fonts) => fonts.length > 0 && fonts.every((f) => f.status === 'loaded'));
		})
	).toBe(true);
	await page.screenshot({ path: `../.amp/in/artifacts/${name}.png`, fullPage: true });
}

test('landing, mobile, team creation, shared joining and captain permissions', async ({
	page,
	context,
	browser
}) => {
	await page.goto('about:blank');
	const defaultFont = await page
		.locator('body')
		.evaluate((node) => getComputedStyle(node).fontFamily);
	await page.goto('/');
	await expect(page.locator('summary')).toHaveCount(2);
	await expect(page.getByRole('banner')).toHaveCount(0);
	await expect(page.getByRole('contentinfo')).toHaveCount(0);
	await expect(page.locator('body')).toHaveCSS('font-family', defaultFont);
	await page.screenshot({ path: '../.amp/in/artifacts/landing-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: '../.amp/in/artifacts/landing-mobile.png', fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.locator('summary').first().focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('details').first().locator('p')).toBeVisible();
	await page.locator('summary').nth(1).click();
	await expect(page.locator('details').nth(1).locator('p')).toBeVisible();
	await page.screenshot({ path: '../.amp/in/artifacts/faq-mobile.png', fullPage: true });
	expect((await context.request.get('/privacy')).status()).toBe(404);
	await page.setViewportSize({ width: 1440, height: 1000 });
	expect((await signIn(context.request, 'captain')).status()).toBe(303);
	await page.goto('/team');
	await capture(page, 'register-desktop');
	await page.getByLabel('team name', { exact: true }).fill('department of bad ideas');
	await page.getByRole('button', { name: 'register your team' }).click();
	await expect(page.getByRole('heading', { name: 'department of bad ideas' })).toBeVisible();
	const link = await page.getByLabel('your team invitation').inputValue();
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: 'copy link' }).click();
	await expect(page.getByRole('button', { name: 'copied!' })).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
	const member = await actorContext(browser, 'unverified-member');
	const memberPage = await member.newPage();
	await memberPage.goto(link);
	await expect(memberPage.getByRole('heading', { name: 'department of bad ideas' })).toBeVisible();
	await memberPage.getByRole('button', { name: 'join this team' }).click();
	await expect(memberPage.getByRole('heading', { name: 'the personnel (2)' })).toBeVisible();
	expect((await post(member.request, { action: 'rename', name: 'not allowed' })).status()).toBe(
		403
	);
	expect(
		(
			await post(member.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'victim@example.com'
			})
		).status()
	).toBe(403);
	await page.reload();
	await capture(page, 'team-desktop');
	await page.setViewportSize({ width: 390, height: 844 });
	await capture(page, 'team-mobile');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.getByLabel('send via', { exact: true }).selectOption('slack');
	await expect(page.getByLabel('their slack member id or profile link')).toBeVisible();
	await capture(page, 'team-slack');
	await page.getByLabel('send via', { exact: true }).selectOption('email');
	await page.getByText('captain’s paperwork', { exact: true }).click();
	await capture(page, 'team-paperwork');
	await page.getByLabel('team name', { exact: true }).fill('department of worse ideas');
	await page.getByRole('button', { name: 'save name' }).click();
	await expect(page.getByRole('heading', { name: 'department of worse ideas' })).toBeVisible();
	expect((await post(context.request, { action: 'leave' })).status()).toBe(409);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'make captain' }).click();
	await expect(page.getByText('captain’s paperwork', { exact: true })).toHaveCount(0);
	expect(
		(await post(context.request, { action: 'remove', member: 'ident!unverified-member' })).status()
	).toBe(403);
	await memberPage.reload();
	await expect(
		memberPage.getByText('sending requires a verified, eligible', { exact: false })
	).toBeVisible();
	await capture(memberPage, 'team-unverified');
	await member.close();
	await page.getByRole('link', { name: 'hcav home' }).click();
	await expect(page.locator('body')).toHaveCSS('font-family', defaultFont);
	await expect(page.locator('summary')).toHaveCount(2);
});

test('oidc rejects invalid state, nonce, signature, audience and expiry; logout revokes sessions', async ({
	context,
	page
}) => {
	const invalid = await context.request.get('/auth/callback?state=bogus&code=bogus');
	expect(invalid.status()).toBe(400);
	for (const fault of ['nonce', 'signature', 'audience', 'expired']) {
		const result = await signIn(context.request, 'invalid-login', fault);
		expect(result.status(), fault).toBe(400);
	}
	expect(state().people.some((person) => person.id === 'ident!invalid-login')).toBe(false);
	const success = await signIn(context.request, 'logout-user', '', '//evil.example');
	expect(success.headers().location).toBe('/team');
	const cookies = await context.cookies();
	const session = cookies.find((cookie) => cookie.name === 'hcav_session');
	expect(session?.httpOnly).toBe(true);
	expect(session?.sameSite).toBe('Lax');
	const crossSite = await context.request.post('/team', {
		form: { action: 'create', name: 'forged' },
		headers: { Origin: 'https://evil.example' }
	});
	expect(crossSite.status()).toBe(403);
	await page.goto('/team');
	await page.getByRole('button', { name: 'sign out' }).click();
	await expect(page).toHaveURL(`${app}/`);
	await context.addCookies([{ name: 'hcav_session', value: session?.value || '', url: app }]);
	expect((await context.request.get('/team', { maxRedirects: 0 })).headers().location).toContain(
		'/auth/login'
	);
});

test('targeted invitations bind recipients, opt out, expire and revoke without removing members', async ({
	browser
}) => {
	const sender = await actorContext(browser, 'dispatch-captain');
	const name = 'the dispatch department https://evil.example @channel';
	expect((await create(sender.request, name)).status()).toBe(200);
	expect(
		(
			await post(sender.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'email-guest@example.com'
			})
		).status()
	).toBe(200);
	const mail = state().mail.find((row) => row.recipient === 'email-guest@example.com');
	expect(mail?.status).toBe('ready');
	expect(mail?.body).not.toContain('evil.example');
	expect(mail?.body).not.toContain('@channel');
	const link = mail?.body.match(/http:\/\/localhost:5174\/invite\/[A-Za-z0-9_-]{43}/)?.[0] || '';
	expect(link).not.toBe('');
	const stranger = await actorContext(browser, 'wrong-account');
	expect((await post(stranger.request, {}, link)).status()).toBe(403);
	const guest = await actorContext(browser, 'email-guest');
	expect((await post(guest.request, {}, link)).status()).toBe(303);
	expect(state().people.find((person) => person.id === 'ident!email-guest')?.team_id).toBe(
		state().teams.find((team) => team.name === name)?.id
	);
	expect((await post(guest.request, {}, link)).status()).toBe(410);
	expect(
		(
			await post(sender.request, {
				action: 'invite',
				channel: 'slack',
				recipient: 'https://hackclub.slack.com/team/UFRIEND001'
			})
		).status()
	).toBe(200);
	const dm = state().slack.find((row) => row.channel === 'DFRIEND001');
	expect(dm?.mrkdwn).toBe(false);
	const dmLink = dm?.text.match(/http:\/\/localhost:5174\/invite\/[A-Za-z0-9_-]{43}/)?.[0] || '';
	const slackGuest = await actorContext(browser, 'slack-guest');
	expect((await post(slackGuest.request, {}, dmLink)).status()).toBe(303);
	expect(
		(
			await post(sender.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'decline-guest@example.com'
			})
		).status()
	).toBe(200);
	const declineMail = state().mail.find((row) => row.recipient === 'decline-guest@example.com');
	const declineLink =
		declineMail?.body.match(/http:\/\/localhost:5174\/invite\/[A-Za-z0-9_-]{43}/)?.[0] || '';
	const declinePage = await stranger.newPage();
	await declinePage.goto(`${declineLink}/decline`);
	await capture(declinePage, 'decline');
	await declinePage.getByRole('button', { name: 'stop invitations' }).click();
	await expect(declinePage.getByRole('heading', { name: 'request acknowledged.' })).toBeVisible();
	await capture(declinePage, 'decline-done');
	expect((await stranger.request.get(declineLink)).status()).toBe(410);
	const shared = `${app}/join/${state().teams.find((team) => team.name === name)?.link_token}`;
	const anonymous = await browser.newContext({ baseURL: app });
	const invitePage = await anonymous.newPage();
	await invitePage.goto(shared);
	await capture(invitePage, 'invite-anonymous');
	const returnPath = new URL(shared).pathname;
	await expect(invitePage.getByRole('link', { name: 'sign in with hack club' })).toHaveAttribute(
		'href',
		`/auth/login?next=${encodeURIComponent(returnPath)}`
	);
	expect(
		(await signIn(anonymous.request, 'returning-guest', '', returnPath)).headers().location
	).toBe(returnPath);
	await invitePage.goto(shared);
	await capture(invitePage, 'invite-signed-in');
	expect((await post(sender.request, { action: 'rotate' })).status()).toBe(200);
	expect((await anonymous.request.get(shared)).status()).toBe(410);
	await invitePage.goto(shared);
	await capture(invitePage, 'expired-invite');
	expect(state().people.find((person) => person.id === 'ident!email-guest')?.team_id).toBeTruthy();
	for (const context of [sender, stranger, guest, slackGuest, anonymous]) await context.close();
});

test('email caps are lifetime and per-team while slack retains the combined quotas', async ({
	browser
}) => {
	const captain = await actorContext(browser, 'limit-captain');
	expect((await create(captain.request, 'quota department')).status()).toBe(200);
	const emails = await Promise.all(
		Array.from({ length: 6 }, (_, index) =>
			post(captain.request, {
				action: 'invite',
				channel: 'email',
				recipient: `quota-${index}@example.com`
			})
		)
	);
	expect(emails.filter((response) => response.status() === 200)).toHaveLength(5);
	expect(emails.filter((response) => response.status() === 429)).toHaveLength(1);
	const messages = await Promise.all(
		Array.from({ length: 6 }, (_, index) =>
			post(captain.request, {
				action: 'invite',
				channel: 'slack',
				recipient: `ULIMIT00${String(index).padStart(2, '0')}`
			})
		)
	);
	expect(messages.filter((response) => response.status() === 200)).toHaveLength(5);
	expect(messages.filter((response) => response.status() === 429)).toHaveLength(1);
	const delivered = state();
	expect(delivered.mail.filter((row) => row.recipient.startsWith('quota-'))).toHaveLength(5);
	expect(delivered.slack.filter((row) => row.channel.startsWith('DLIMIT'))).toHaveLength(5);
	const other = await actorContext(browser, 'other-captain');
	expect((await create(other.request, 'other quota department')).status()).toBe(200);
	const previous =
		delivered.mail.find((row) => row.recipient.startsWith('quota-'))?.recipient || '';
	expect(
		(
			await post(other.request, { action: 'invite', channel: 'email', recipient: previous })
		).status()
	).toBe(429);
	expect(
		(
			await post(other.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'a@example.com\r\nbcc:evil@example.com'
			})
		).status()
	).toBe(400);
	// Quotas remain in the real durable store; rolling windows are not memory counters.
	const sql = new DatabaseSync('../.amp/in/test.sqlite');
	sql
		.prepare('UPDATE limits SET at = at - ? WHERE bucket LIKE ?')
		.run(3600_001, 'sender:ident!limit-captain');
	sql.close();
	// Team quota still blocks after the sender's hour is over.
	expect(
		(
			await post(captain.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'still-blocked@example.com'
			})
		).status()
	).toBe(429);
	const team = state().teams.find((team) => team.name === 'quota department');
	const clock = new DatabaseSync('../.amp/in/test.sqlite');
	// Advance the rolling sender/team hour, but keep all five emails inside their 24-hour window.
	clock
		.prepare('UPDATE limits SET at = at - ? WHERE bucket IN (?, ?)')
		.run(3600_001, 'sender:ident!limit-captain', `team:${team?.id}`);
	expect(
		(
			await post(captain.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'sixth@example.com'
			})
		).status()
	).toBe(429);
	expect(
		(
			await post(captain.request, { action: 'invite', channel: 'slack', recipient: 'UAFTER0001' })
		).status()
	).toBe(200);
	// Exactly one email falls outside the rolling day, freeing exactly one slot.
	clock
		.prepare(`UPDATE email_recipients SET at = ? WHERE recipient = (
		SELECT recipient FROM email_recipients WHERE team_id = ? ORDER BY at LIMIT 1
	)`)
		.run(Date.now() - 86400_001, team?.id);
	expect(
		(
			await post(captain.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'sixth@example.com'
			})
		).status()
	).toBe(200);
	expect(
		(
			await post(captain.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'seventh@example.com'
			})
		).status()
	).toBe(429);
	const successor = await actorContext(browser, 'replacement-captain');
	expect((await post(successor.request, {}, `/join/${team?.link_token}`)).status()).toBe(303);
	expect(
		(
			await post(captain.request, { action: 'transfer', member: 'ident!replacement-captain' })
		).status()
	).toBe(200);
	expect(
		(
			await post(successor.request, {
				action: 'invite',
				channel: 'email',
				recipient: 'new-captain@example.com'
			})
		).status()
	).toBe(429);
	// Lifetime protection must outlast both rolling counters and retained invitation tokens.
	clock.prepare('UPDATE limits SET at = at - ?').run(8 * 86400_000);
	clock.prepare('UPDATE email_recipients SET at = at - ?').run(8 * 86400_000);
	clock.prepare("DELETE FROM invitations WHERE channel = 'email'").run();
	clock.close();
	expect(
		(
			await post(other.request, {
				action: 'invite',
				channel: 'email',
				recipient: `  ${previous.toUpperCase()}  `
			})
		).status()
	).toBe(429);
	expect(state().mail.filter((row) => row.recipient === previous)).toHaveLength(1);
	await captain.close();
	await other.close();
	await successor.close();
});

test('unverified and ineligible captains can register but cannot send; users cannot join two teams', async ({
	browser
}) => {
	let firstLink = '';
	const contexts: BrowserContext[] = [];
	for (const actor of ['unverified-captain', 'adult', 'email-unverified']) {
		const context = await actorContext(browser, actor);
		contexts.push(context);
		expect((await create(context.request, `${actor} team`)).status()).toBe(200);
		expect(
			(
				await post(context.request, {
					action: 'invite',
					channel: 'email',
					recipient: `${actor}-friend@example.com`
				})
			).status()
		).toBe(403);
		const value = state().teams.find((team) => team.captain_id === `ident!${actor}`);
		if (!firstLink) firstLink = `/join/${value?.link_token}`;
		else expect((await post(context.request, {}, firstLink)).status()).toBe(409);
	}
	for (const context of contexts) await context.close();
});

test('teams can grow beyond an airtable page without exposing member email addresses', async ({
	browser
}) => {
	const context = await actorContext(browser, 'large-newcomer');
	expect((await post(context.request, {}, `/join/${'L'.repeat(43)}`)).status()).toBe(303);
	const page = await context.newPage();
	await page.goto('/team');
	await expect(page.getByRole('heading', { name: 'the personnel (105)' })).toBeVisible();
	await expect(page.getByText('large member 103', { exact: true })).toBeVisible();
	expect(await page.content()).not.toContain('private-member-103@example.com');
	await context.close();
});
