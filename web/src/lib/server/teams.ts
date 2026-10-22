import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { members, person, rows, type Team, team, upsert } from './airtable';
import { type Identity, inviteSeconds } from './config';
import { profile } from './profiles';
import { commonChannels, queueChannel } from './slack';
import { token } from './store';

export function teamName(value: FormDataEntryValue | null) {
	const name = String(value || '').trim();
	if (name.length < 2 || name.length > 64 || /[\p{Cc}\p{Cf}]/u.test(name)) {
		error(400, 'Your team name must be 2–64 characters, without control characters.');
	}
	return name;
}

export async function currentTeam(identity: Identity) {
	const user = await person(identity.id);
	return user?.team_id ? team(user.team_id) : undefined;
}

export async function captain(identity: Identity): Promise<Team> {
	const value = await currentTeam(identity);
	if (!value || value.captain_id !== identity.id) error(403, 'Only the team captain can do that.');
	return value;
}

export async function createTeam(identity: Identity, name: string) {
	if (await currentTeam(identity)) error(409, 'You already belong to a team.');
	// Recover a team created just before an interrupted membership write.
	const existing = (await rows<Team>('teams', 'captain_id', identity.id))[0];
	const value = existing || {
		id: randomUUID(),
		name,
		captain_id: identity.id,
		open_registration: false,
		link_token: token(),
		link_expires: new Date(Date.now() + inviteSeconds * 1000).toISOString()
	};
	if (!existing) await upsert('teams', value);
	await upsert('people', { id: identity.id, team_id: value.id });
}

export async function joinTeam(identity: Identity, id: string, openOnly = false) {
	const current = await currentTeam(identity);
	if (current && current.id !== id) error(409, 'Leave your current team before joining another.');
	const value = await team(id);
	if (!value) error(410, 'This team is no longer available.');
	if (openOnly && !value.open_registration)
		error(403, 'This team is invite-only now. Ask for a link.');
	await upsert('people', { id: identity.id, team_id: id });
	for (const channel of commonChannels) queueChannel(identity.slackId, channel.id);
	if (value.hq_channel_id) queueChannel(identity.slackId, value.hq_channel_id, value.id, true);
}

export async function leaveTeam(identity: Identity) {
	const value = await currentTeam(identity);
	if (!value) error(400, 'You are not on a team.');
	if (value.captain_id === identity.id) error(409, 'Transfer captaincy before leaving your team.');
	await upsert('people', { id: identity.id, team_id: '' });
}

export async function manageMember(identity: Identity, id: string, transfer: boolean) {
	const value = await captain(identity);
	const member = await person(id);
	if (id === identity.id || member?.team_id !== value.id)
		error(400, 'Choose another current team member.');
	if (transfer) await upsert('teams', { id: value.id, captain_id: id });
	else await upsert('people', { id, team_id: '' });
}

export async function rotateLink(identity: Identity) {
	const value = await captain(identity);
	await upsert('teams', {
		id: value.id,
		link_token: token(),
		link_expires: new Date(Date.now() + inviteSeconds * 1000).toISOString()
	});
}

export async function roster(id: string) {
	return Promise.all(
		(await members(id)).map(async (member) => ({
			id: member.id,
			...(await profile(member.slack_id))
		}))
	);
}
