import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { upsert } from '#lib/server/airtable';
import { requireUser } from '#lib/server/auth';
import { origin } from '#lib/server/config';
import { channelStatus, queueChannels } from '#lib/server/slack';
import { exclusive, hash, reserve } from '#lib/server/store';
import {
	captain,
	createTeam,
	currentTeam,
	leaveTeam,
	manageMember,
	roster,
	rotateLink,
	teamName
} from '#lib/server/teams';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const identity = requireUser(event);
	const value = await currentTeam(identity);
	return {
		team: value
			? {
					id: value.id,
					name: value.name,
					captainId: value.captain_id,
					open: value.open_registration === true,
					hqId: value.hq_channel_id || '',
					hqName: value.hq_channel_name || ''
				}
			: null,
		members: value ? await roster(value.id) : [],
		inviteLink: value ? `${origin()}/join/${value.link_token}` : '',
		linkExpired: value ? !(Date.parse(value.link_expires) > Date.now()) : false,
		channels: channelStatus(identity.slackId, value?.hq_channel_id)
	};
};

export const actions: Actions = {
	default: async (event) => {
		const identity = requireUser(event);
		reserve([
			{ key: `mutation:${identity.id}`, window: 60_000, max: 20 },
			{ key: `mutation-ip:${hash(event.getClientAddress())}`, window: 60_000, max: 40 }
		]);
		const form = await event.request.formData();
		const action = String(form.get('action'));
		try {
			await exclusive(async () => {
				switch (action) {
					case 'create':
						await createTeam(identity, teamName(form.get('name')));
						break;
					case 'rename': {
						const value = await captain(identity);
						await upsert('teams', { id: value.id, name: teamName(form.get('name')) });
						break;
					}
					case 'registration': {
						const value = await captain(identity);
						await upsert('teams', { id: value.id, open_registration: form.get('open') === 'on' });
						break;
					}
					case 'leave':
						await leaveTeam(identity);
						break;
					case 'remove':
						await manageMember(identity, String(form.get('member')), false);
						break;
					case 'transfer':
						await manageMember(identity, String(form.get('member')), true);
						break;
					case 'rotate':
						await rotateLink(identity);
						break;
					case 'retry-channels': {
						reserve([{ key: `channel-retry:${identity.id}`, window: 60_000, max: 1 }]);
						await queueChannels(identity.slackId, (await currentTeam(identity))?.id, true);
						break;
					}
					default:
						error(400, 'Unknown request.');
				}
			});
		} catch (cause) {
			if (isHttpError(cause)) return fail(cause.status, { message: cause.body.message });
			throw cause;
		}
		if (action === 'leave') redirect(303, '/team');
		return {
			message:
				action === 'retry-channels' ? 'Channel additions queued. Check back in a moment.' : 'Saved.'
		};
	}
};
