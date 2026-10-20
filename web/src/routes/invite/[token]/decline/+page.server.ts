import { error } from '@sveltejs/kit';
import { db, exclusive, hash, invitation, recipientKey } from '#lib/server/store';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	if (!invitation(params.token)) error(404, 'this invitation was not found.');
};

export const actions: Actions = {
	default: async ({ params }) => {
		await exclusive(async () => {
			const value = invitation(params.token);
			if (!value) error(404, 'this invitation was not found.');
			db()
				.prepare('INSERT OR IGNORE INTO suppressed VALUES (?)')
				.run(recipientKey(value.channel, value.recipient));
			db()
				.prepare("UPDATE invitations SET status = 'declined' WHERE hash = ?")
				.run(hash(params.token));
		});
		return { done: true };
	}
};
