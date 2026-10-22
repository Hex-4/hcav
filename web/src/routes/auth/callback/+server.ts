import { error, redirect } from '@sveltejs/kit';
import * as oidc from 'openid-client';
import { type Person, person, rows, upsert } from '#lib/server/airtable';
import { cookieOptions, provider } from '#lib/server/auth';
import { cookieName, type Identity, origin, sessionSeconds } from '#lib/server/config';
import { profile } from '#lib/server/profiles';
import { queueChannels } from '#lib/server/slack';
import { exclusive, removeSession, saveSession, takeOAuth } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const binding = event.cookies.get('hcav_oauth');
	event.cookies.delete('hcav_oauth', { path: '/' });
	const flow = binding ? takeOAuth(binding) : null;
	if (!flow || event.url.searchParams.get('state') !== flow.state)
		error(400, 'This sign-in expired. Please start again.');
	if (event.url.searchParams.has('error'))
		error(400, 'Sign-in was not completed. You can try again whenever you are ready.');
	let identity: Identity;
	try {
		const config = await provider();
		const callback = new URL(`/auth/callback${event.url.search}`, origin());
		const tokens = await oidc.authorizationCodeGrant(config, callback, {
			expectedState: flow.state,
			expectedNonce: flow.nonce,
			pkceCodeVerifier: flow.verifier,
			idTokenExpected: true
		});
		const claims = tokens.claims();
		if (!claims?.sub) throw new Error('missing subject');
		const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
		if (typeof info.email !== 'string' || !info.email.includes('@'))
			throw new Error('missing email');
		identity = {
			id: claims.sub,
			name: '',
			email: info.email.toLowerCase(),
			emailVerified: info.email_verified === true,
			slackId: typeof info.slack_id === 'string' ? info.slack_id : '',
			verified: info.verification_status === 'verified',
			eligible: info.ysws_eligible === true,
			authAt: Date.now()
		};
	} catch {
		error(400, 'We could not verify that sign-in. Please start again.');
	}
	if (!/^[UW][A-Z0-9]{8,20}$/.test(identity.slackId))
		error(403, 'Link your Hack Club Slack account at auth.hackclub.com, then sign in again.');
	identity.name = (await profile(identity.slackId)).name;
	await exclusive(async () => {
		const linked = await rows<Person>('people', 'slack_id', identity.slackId);
		if (linked.some((value) => value.id !== identity.id))
			error(
				409,
				'This Slack account is already linked to another HCAV account. Contact The Organization.'
			);
		await upsert('people', {
			id: identity.id,
			name: identity.name,
			email: identity.email,
			email_verified: identity.emailVerified,
			slack_id: identity.slackId,
			verification_status: identity.verified ? 'verified' : 'unverified',
			ysws_eligible: identity.eligible
		});
		const current = await person(identity.id);
		await queueChannels(identity.slackId, current?.team_id, true);
	});
	const old = event.cookies.get(cookieName);
	if (old) removeSession(old);
	event.cookies.set(cookieName, saveSession(identity), {
		...cookieOptions(),
		maxAge: sessionSeconds
	});
	redirect(303, flow.next);
};
