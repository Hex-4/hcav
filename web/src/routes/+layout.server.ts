import { profile } from '#lib/server/profiles';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => ({
	user: locals.identity
		? { ...(await profile(locals.identity.slackId)), id: locals.identity.id }
		: null
});
