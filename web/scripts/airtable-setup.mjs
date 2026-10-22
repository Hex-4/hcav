// read-only by default. --apply creates missing tables and fields, never changes existing fields.
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
	{
		name: 'teams',
		fields: [
			'id',
			'name',
			'captain_id',
			'link_token',
			'link_expires',
			'hq_channel_id',
			'hq_channel_name'
		]
			.map(text)
			.concat([checkbox('open_registration')])
	}
];

async function api(body, path = '') {
	const response = await fetch(`https://api.airtable.com/v0/meta/bases/${base}/tables${path}`, {
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
// validate every existing field before making any writes.
for (const table of tables) {
	const found = existing.find((item) => item.name === table.name);
	for (const field of table.fields) {
		const current = found?.fields.find((item) => item.name === field.name);
		if (current && current.type !== field.type) {
			throw new Error(
				`${table.name}.${field.name}: expected ${field.type}, found ${current.type}. no changes made.`
			);
		}
	}
}

for (const table of tables) {
	const found = existing.find((item) => item.name === table.name);
	if (found) {
		let missing = false;
		for (const field of table.fields) {
			if (!found.fields.some((item) => item.name === field.name)) {
				missing = true;
				if (process.argv.includes('--apply')) {
					await new Promise((resolve) => setTimeout(resolve, 250));
					await api(field, `/${encodeURIComponent(found.id)}/fields`);
					console.log(`${table.name}.${field.name}: created (${field.type})`);
				} else {
					console.log(`${table.name}.${field.name}: would create (${field.type})`);
				}
			}
		}
		if (!missing) console.log(`${table.name}: ready`);
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
	console.log('no changes made. add --apply to create missing tables and fields.');
