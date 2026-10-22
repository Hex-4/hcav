import { type RequestEvent, redirect } from '@sveltejs/kit';
import * as oidc from 'openid-client';
import { type Identity, origin, required } from './config';

let configuration: Promise<oidc.Configuration> | undefined;
export async function provider() {
	const id = required('HCA_CLIENT_ID');
	const secret = required('HCA_CLIENT_SECRET');
	if (!configuration) {
		configuration = oidc
			.discovery(new URL('https://auth.hackclub.com'), id, secret, undefined, {
				execute: [oidc.enableNonRepudiationChecks],
				timeout: 10
			})
			.catch((cause) => {
				configuration = undefined;
				throw cause;
			});
	}
	return configuration;
}

export function requireUser(event: Pick<RequestEvent, 'locals' | 'url'>): Identity {
	if (!event.locals.identity?.slackId)
		redirect(303, `/auth/login?next=${encodeURIComponent(safeNext(event.url.pathname))}`);
	return event.locals.identity;
}

export function safeNext(value: string | null) {
	return value && /^\/(?:teams?|join\/[A-Za-z0-9_-]{43})$/.test(value) ? value : '/team';
}

export function cookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: origin().startsWith('https:')
	};
}
