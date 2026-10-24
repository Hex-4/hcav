import { createHmac, timingSafeEqual } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import { required } from '#lib/server/config';
import { db, hash, reserve } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	if (Buffer.byteLength(body) > 16_384) error(413, 'Request too large.');
	const timestamp = request.headers.get('x-slack-request-timestamp') || '';
	if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
		error(401, 'Expired Slack request.');
	const expected = `v0=${createHmac('sha256', required('SLACK_SIGNING_SECRET')).update(`v0:${timestamp}:${body}`).digest('hex')}`;
	const signature = request.headers.get('x-slack-signature') || '';
	if (
		!/^v0=[a-f0-9]{64}$/.test(signature) ||
		!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
	)
		error(401, 'Invalid Slack signature.');
	const form = new URLSearchParams(body);
	if (form.get('team_id') !== required('SLACK_TEAM_ID')) error(403, 'Wrong workspace.');
	const user = form.get('user_id') || '';
	const channel = form.get('channel_id') || '';
	if (!/^[UW][A-Z0-9]{8,20}$/.test(user) || !/^[CG][A-Z0-9]{8,20}$/.test(channel))
		return json({ response_type: 'ephemeral', text: 'Run /hcav hq in your team’s channel.' });
	if (form.get('command') !== '/hcav' || form.get('text')?.trim() !== 'hq')
		return json({
			response_type: 'ephemeral',
			text: 'Invite The Organization bot to your team channel, then run /hcav hq there.'
		});
	const responseUrl = form.get('response_url') || '';
	if (responseUrl && !/^https:\/\/hooks\.slack\.com\/commands\/[A-Za-z0-9/_-]+$/.test(responseUrl))
		error(400, 'Invalid Slack response URL.');
	const id = hash(`${timestamp}:${body}`);
	if (!db().prepare('SELECT 1 FROM slack_commands WHERE id = ?').get(id)) {
		reserve([{ key: `slack-command:${user}`, window: 60_000, max: 5 }]);
		db()
			.prepare('INSERT INTO slack_commands (id, payload, at) VALUES (?, ?, ?)')
			.run(
				id,
				JSON.stringify({ user, channel, responseUrl: responseUrl || undefined }),
				Date.now()
			);
	}
	return json({
		response_type: 'ephemeral',
		text: 'Checking your captain credentials. One moment.'
	});
};
