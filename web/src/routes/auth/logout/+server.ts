import { redirect } from '@sveltejs/kit';
import { cookieName } from '#lib/server/config';
import { removeSession } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	const value = cookies.get(cookieName);
	if (value) removeSession(value);
	cookies.delete(cookieName, { path: '/' });
	redirect(303, '/');
};
