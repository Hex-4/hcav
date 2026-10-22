import { randomInt } from 'node:crypto';
import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { type Person, rows, type Team } from '#lib/server/airtable';
import { requireUser } from '#lib/server/auth';
import { profile } from '#lib/server/profiles';
import { exclusive, reserve } from '#lib/server/store';
import { currentTeam, joinTeam } from '#lib/server/teams';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const identity = requireUser(event);
	const [values, people] = await Promise.all([rows<Team>('teams'), rows<Person>('people')]);
	for (let i = values.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[values[i], values[j]] = [values[j], values[i]];
	}
	values.sort(
		(a, b) => Number(Boolean(b.open_registration)) - Number(Boolean(a.open_registration))
	);
	return {
		teams: await Promise.all(
			values.map(async (value) => ({
				id: value.id,
				name: value.name,
				open: value.open_registration === true,
				members: await Promise.all(
					people
						.filter((member) => member.team_id === value.id)
						.map((member) => profile(member.slack_id))
				)
			}))
		),
		currentTeamId: (await currentTeam(identity))?.id || ''
	};
};

export const actions: Actions = {
	default: async (event) => {
		const identity = requireUser(event);
		reserve([{ key: `join:${identity.id}`, window: 60_000, max: 10 }]);
		const form = await event.request.formData();
		try {
			await exclusive(() => joinTeam(identity, String(form.get('team') || ''), true));
		} catch (cause) {
			if (isHttpError(cause)) return fail(cause.status, { message: cause.body.message });
			throw cause;
		}
		redirect(303, '/team');
	}
};
