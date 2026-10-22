import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth';
import { resolveShared } from '#lib/server/invites';
import { exclusive, reserve } from '#lib/server/store';
import { currentTeam, joinTeam } from '#lib/server/teams';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const value = await resolveShared(params.token);
	return {
		teamName: value.name,
		currentTeam: locals.identity ? (await currentTeam(locals.identity))?.name || '' : '',
		next: `/join/${params.token}`
	};
};

export const actions: Actions = {
	default: async (event) => {
		const identity = requireUser(event);
		reserve([{ key: `join:${identity.id}`, window: 60_000, max: 10 }]);
		try {
			await exclusive(async () => {
				const value = await resolveShared(event.params.token);
				await joinTeam(identity, value.id);
			});
		} catch (cause) {
			if (isHttpError(cause)) return fail(cause.status, { message: cause.body.message });
			throw cause;
		}
		redirect(303, '/team');
	}
};
