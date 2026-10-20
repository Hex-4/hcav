// read-only by default. --apply creates missing hcav tables, never modifies existing tables.
const token = process.env.AIRTABLE_TOKEN;
const base = process.env.AIRTABLE_BASE_ID;
if (!token || !base) throw new Error('AIRTABLE_TOKEN and AIRTABLE_BASE_ID are required');

const text = (name) => ({ name, type: 'singleLineText' });
const checkbox = (name) => ({
	name,
	type: 'checkbox',
	options: { icon: 'check', color: 'greenBright' }
});
const tables = [
	{
		name: 'people',
		fields: ['id', 'name', 'email', 'slack_id', 'verification_status', 'team_id']
			.map(text)
			.concat([checkbox('email_verified'), checkbox('ysws_eligible')])
	},
	{ name: 'teams', fields: ['id', 'name', 'captain_id', 'link_token', 'link_expires'].map(text) },
	{
		name: 'mail',
		fields: ['id', 'recipient', 'subject', 'status', 'created_at']
			.map(text)
			.concat([{ name: 'body', type: 'multilineText' }])
	}
];

async function api(body) {
	const response = await fetch(`https://api.airtable.com/v0/meta/bases/${base}/tables`, {
		method: body ? 'POST' : 'GET',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok)
		throw new Error(`airtable schema request failed: ${response.status}. check schema scopes.`);
	return response.json();
}

const existing = (await api()).tables;
for (const table of tables) {
	const found = existing.find((item) => item.name === table.name);
	if (found) {
		for (const field of table.fields) {
			if (!found.fields.some((item) => item.name === field.name && item.type === field.type)) {
				throw new Error(
					`${table.name}.${field.name} is missing or has the wrong type. fix it manually before continuing.`
				);
			}
		}
		console.log(`${table.name}: ready`);
	} else if (process.argv.includes('--apply')) {
		await new Promise((resolve) => setTimeout(resolve, 250));
		await api(table);
		console.log(`${table.name}: created`);
	} else {
		console.log(
			`${table.name}: would create (${table.fields.map((field) => `${field.name}: ${field.type}`).join(', ')})`
		);
	}
}
if (!process.argv.includes('--apply'))
	console.log('no changes made. add --apply to create missing tables.');
