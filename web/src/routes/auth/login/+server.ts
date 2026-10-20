import { redirect } from '@sveltejs/kit';
import * as oidc from 'openid-client';
import { cookieOptions, provider, safeNext } from '#lib/server/auth';
import { origin } from '#lib/server/config';
import { hash, reserve, saveOAuth, token } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	reserve([{ key: `login:${hash(event.getClientAddress())}`, window: 3600_000, max: 30 }]);
	const config = await provider();
	const verifier = oidc.randomPKCECodeVerifier();
	const state = oidc.randomState();
	const nonce = oidc.randomNonce();
	const binding = token();
	const next = safeNext(event.url.searchParams.get('next'));
	saveOAuth(binding, { verifier, state, nonce, next });
	event.cookies.set('hcav_oauth', binding, { ...cookieOptions(), maxAge: 600 });
	const url = oidc.buildAuthorizationUrl(config, {
		redirect_uri: `${origin()}/auth/callback`,
		response_type: 'code',
		scope: 'openid profile email slack_id verification_status',
		state,
		nonce,
		code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
		code_challenge_method: 'S256',
		...(event.url.searchParams.has('refresh') ? { prompt: 'login' } : {})
	});
	redirect(303, url.href, { external: ['https://auth.hackclub.com'] });
};
