import { error, type RequestEvent, redirect } from '@sveltejs/kit';
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

export function requireUser(event: Pick<RequestEvent, 'locals'>): Identity {
	if (!event.locals.identity) redirect(303, '/auth/login?next=/team');
	return event.locals.identity;
}

export function requireSender(identity: Identity, channel: string) {
	if (!identity.verified || !identity.eligible || !identity.emailVerified) {
		error(
			403,
			'sending invitations requires a verified, eligible hack club account. you can still share your team link.'
		);
	}
	if (Date.now() - identity.authAt > 86400_000)
		error(403, 'sign in again to refresh your verification before sending.');
	if (channel === 'slack' && !identity.slackId)
		error(403, 'connect slack to your hack club account, then sign in again.');
}

export function safeNext(value: string | null) {
	return value && /^\/(?:team|join\/[A-Za-z0-9_-]{43}|invite\/[A-Za-z0-9_-]{43})$/.test(value)
		? value
		: '/team';
}

export function cookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: origin().startsWith('https:')
	};
}
