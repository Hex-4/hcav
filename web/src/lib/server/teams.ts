import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { members, person, rows, type Team, team, upsert } from './airtable';
import { type Identity, inviteSeconds } from './config';
import { db, token } from './store';

export function teamName(value: FormDataEntryValue | null) {
	const name = String(value || '').trim();
	if (name.length < 2 || name.length > 64 || /[\p{Cc}\p{Cf}]/u.test(name)) {
		error(400, 'your team name must be 2–64 characters, without control characters.');
	}
	return name;
}

export async function currentTeam(identity: Identity) {
	const user = await person(identity.id);
	return user?.team_id ? team(user.team_id) : undefined;
}

export async function captain(identity: Identity): Promise<Team> {
	const value = await currentTeam(identity);
	if (!value || value.captain_id !== identity.id) error(403, 'only the team captain can do that.');
	return value;
}

export async function createTeam(identity: Identity, name: string) {
	if (await currentTeam(identity)) error(409, 'you already belong to a team.');
	// Recover a team created just before an interrupted membership write.
	const existing = (await rows<Team>('teams', 'captain_id', identity.id))[0];
	const value = existing || {
		id: randomUUID(),
		name,
		captain_id: identity.id,
		link_token: token(),
		link_expires: new Date(Date.now() + inviteSeconds * 1000).toISOString()
	};
	if (!existing) await upsert('teams', value);
	await upsert('people', { id: identity.id, team_id: value.id });
}

export async function joinTeam(identity: Identity, id: string) {
	const current = await currentTeam(identity);
	if (current && current.id !== id) error(409, 'leave your current team before joining another.');
	if (!(await team(id))) error(410, 'this team is no longer available.');
	await upsert('people', { id: identity.id, team_id: id });
}

export async function leaveTeam(identity: Identity) {
	const value = await currentTeam(identity);
	if (!value) error(400, 'you are not on a team.');
	if (value.captain_id === identity.id) error(409, 'transfer captaincy before leaving your team.');
	await upsert('people', { id: identity.id, team_id: '' });
}

export async function manageMember(identity: Identity, id: string, transfer: boolean) {
	const value = await captain(identity);
	const member = await person(id);
	if (id === identity.id || member?.team_id !== value.id)
		error(400, 'choose another current team member.');
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
	db().prepare("UPDATE invitations SET status = 'revoked' WHERE team_id = ?").run(value.id);
}

export async function roster(id: string) {
	return (await members(id)).map(({ id, name }) => ({ id, name }));
}
