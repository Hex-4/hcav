import { error } from '@sveltejs/kit';
import { rows, type Team } from './airtable';

export async function resolveShared(secret: string) {
	if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) error(404, 'This invitation was not found.');
	const value = (await rows<Team>('teams', 'link_token', secret))[0];
	if (!value || !(Date.parse(value.link_expires) > Date.now()))
		error(410, 'This link expired or was replaced. Ask your team for a new one.');
	return value;
}
