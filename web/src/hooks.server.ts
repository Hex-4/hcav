import { error } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { cookieName, origin } from '#lib/server/config';
import { startSlackWorker } from '#lib/server/slack';
import { cleanup, hash, reserve, session } from '#lib/server/store';

startSlackWorker();

let lastCleanup = 0;
export const handle: Handle = async ({ event, resolve }) => {
	if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
		// Slack authenticates this one endpoint with an HMAC over the raw body.
		if (event.url.pathname !== '/slack/command' && event.request.headers.get('origin') !== origin())
			error(403, 'This request must come from HCAV.');
		if (Number(event.request.headers.get('content-length')) > 16_384)
			error(413, 'That form is too large.');
	}
	if (Date.now() - lastCleanup > 3600_000) {
		cleanup();
		lastCleanup = Date.now();
	}
	event.locals.identity = session(event.cookies.get(cookieName));
	if (event.url.pathname !== '/') {
		reserve([{ key: `request:${hash(event.getClientAddress())}`, window: 60_000, max: 120 }]);
	}
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set(
		'Content-Security-Policy',
		"frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
	);
	if (event.url.pathname !== '/' || event.locals.identity)
		response.headers.set('Cache-Control', 'private, no-store');
	if (origin().startsWith('https:'))
		response.headers.set('Strict-Transport-Security', 'max-age=31536000');
	return response;
};

export const handleError: HandleServerError = ({ kind, error: cause }) => {
	if (kind !== 'unknown') return;
	console.error('unhandled request failure');
	if (process.env.NODE_ENV !== 'production') console.error(cause);
	return { message: 'Something interrupted the paperwork. Please try again shortly.' };
};
