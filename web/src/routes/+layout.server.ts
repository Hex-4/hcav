import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.identity ? { name: locals.identity.name, id: locals.identity.id } : null
});
