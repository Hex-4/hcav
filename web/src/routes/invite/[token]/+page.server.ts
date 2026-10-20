import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth';
import { resolveTargeted } from '#lib/server/invites';
import { db, exclusive, hash } from '#lib/server/store';
import { currentTeam, joinTeam } from '#lib/server/teams';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const value = await resolveTargeted(params.token, locals.identity);
	return {
		teamName: value.name,
		currentTeam: locals.identity ? (await currentTeam(locals.identity))?.name || '' : '',
		next: `/invite/${params.token}`
	};
};

export const actions: Actions = {
	default: async (event) => {
		const identity = requireUser(event);
		try {
			await exclusive(async () => {
				const value = await resolveTargeted(event.params.token, identity);
				await joinTeam(identity, value.id);
				db()
					.prepare("UPDATE invitations SET status = 'accepted' WHERE hash = ?")
					.run(hash(event.params.token));
			});
		} catch (cause) {
			if (isHttpError(cause)) return fail(cause.status, { message: cause.body.message });
			throw cause;
		}
		redirect(303, '/team');
	}
};
