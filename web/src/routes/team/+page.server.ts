import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { upsert } from '#lib/server/airtable';
import { requireUser } from '#lib/server/auth';
import { origin, setting } from '#lib/server/config';
import { sendInvitation } from '#lib/server/invites';
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
		team: value ? { id: value.id, name: value.name, captainId: value.captain_id } : null,
		members: value ? await roster(value.id) : [],
		inviteLink: value ? `${origin()}/join/${value.link_token}` : '',
		linkExpires: value?.link_expires || '',
		canSend:
			identity.verified &&
			identity.eligible &&
			identity.emailVerified &&
			Date.now() - identity.authAt < 86400_000,
		canSlack: Boolean(identity.slackId),
		messagesEnabled: setting('INVITES_ENABLED') === 'true',
		emailEnabled: setting('EMAIL_INVITES_ENABLED') === 'true'
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
					case 'invite':
						await sendInvitation(
							identity,
							String(form.get('channel')),
							String(form.get('recipient') || ''),
							event.getClientAddress()
						);
						break;
					default:
						error(400, 'unknown request.');
				}
			});
		} catch (cause) {
			if (isHttpError(cause)) return fail(cause.status, { message: cause.body.message, ok: false });
			throw cause;
		}
		if (action === 'leave') redirect(303, '/team');
		return {
			ok: true,
			message:
				action === 'invite'
					? 'invitation request recorded. if delivery is available, your friend will receive it. please do not resend.'
					: 'the paperwork is in order.'
		};
	}
};
