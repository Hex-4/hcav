import { error } from '@sveltejs/kit';
import { rows, type Team, team, upsert } from './airtable';
import { requireSender } from './auth';
import { type Identity, inviteSeconds, origin, required, setting } from './config';
import { db, hash, invitation, recipientKey, reserve, token } from './store';
import { captain } from './teams';

export function recipient(channel: string, input: string) {
	if (channel === 'email') {
		const value = input.trim().toLowerCase();
		if (
			value.length > 254 ||
			!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value)
		)
			error(400, 'enter a valid email address.');
		return value;
	}
	if (channel !== 'slack') error(400, 'choose email or slack.');
	const value = input.trim();
	const match = /^(?:[UW][A-Z0-9]{8,20})$/.test(value)
		? value
		: /^https:\/\/hackclub\.slack\.com\/(?:team|archives)\/([UW][A-Z0-9]{8,20})\/?$/.exec(
				value
			)?.[1];
	if (!match) error(400, 'enter a slack member id or a hack club slack member link.');
	return match;
}

type SlackResult = {
	ok: boolean;
	team_id?: string;
	channel?: { id: string };
	user?: { deleted?: boolean; is_bot?: boolean; team_id?: string };
};
async function slack(method: string, body: object): Promise<SlackResult> {
	const response = await fetch(`https://slack.com/api/${method}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${required('SLACK_BOT_TOKEN')}`,
			'Content-Type': 'application/json; charset=utf-8'
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error('slack delivery unavailable');
	const result = (await response.json()) as SlackResult;
	if (!result.ok) throw new Error('slack request rejected');
	return result;
}

let botChecked = false;
async function checkBot() {
	if (!botChecked) {
		const result = await slack('auth.test', {});
		if (result.team_id !== required('SLACK_TEAM_ID')) throw new Error('wrong slack workspace');
		botChecked = true;
	}
}

export async function sendInvitation(identity: Identity, channel: string, raw: string, ip: string) {
	requireSender(identity, channel);
	const value = await captain(identity);
	const target = recipient(channel, raw);
	if (setting('INVITES_ENABLED') !== 'true')
		error(503, 'message invitations are paused. your copyable team link still works.');
	if (channel === 'email' && setting('EMAIL_INVITES_ENABLED') !== 'true')
		error(503, 'email invitations are not available yet. use your team link.');
	if (channel === 'slack') {
		required('SLACK_BOT_TOKEN');
		required('SLACK_TEAM_ID');
	}
	if (target === identity.email || target === identity.slackId)
		error(400, 'you are already here. invite someone else.');
	const key = recipientKey(channel, target);
	const hour = 3600_000;
	const day = 24 * hour;
	reserve(
		[
			{ key: `sender:${identity.id}`, window: hour, max: 10 },
			{ key: `sender:${identity.id}`, window: day, max: 40 },
			{ key: `team:${value.id}`, window: hour, max: 10 },
			{ key: `team:${value.id}`, window: day, max: 40 },
			{ key: `send-ip:${hash(ip)}`, window: hour, max: 30 },
			{ key: `send-ip:${hash(ip)}`, window: day, max: 80 },
			{ key: 'global-send', window: hour, max: 100 },
			{ key: 'global-send', window: day, max: 250 },
			{ key: `recipient:${key}`, window: day, max: 1 },
			{ key: `recipient:${key}`, window: 7 * day, max: 3 }
		],
		channel === 'email' ? { recipient: key, teamId: value.id } : undefined
	);
	// A suppressed address gets the same response; never reveal recipient state.
	if (db().prepare('SELECT 1 FROM suppressed WHERE recipient = ?').get(key)) return;
	const secret = token();
	const id = hash(secret);
	db()
		.prepare(
			'INSERT INTO invitations (hash, team_id, sender_id, channel, recipient, expires) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(id, value.id, identity.id, channel, target, Date.now() + inviteSeconds * 1000);
	const link = `${origin()}/invite/${secret}`;
	const decline = `${link}/decline`;
	// Names cannot add links, markup, mentions or extra lines to the fixed message.
	const [senderName, name] = [identity.name, value.name].map(
		(text) => text.replace(/[^\p{L}\p{N} '’!?&()-]/gu, '').slice(0, 64) || 'a mystery participant'
	);
	const body = `${senderName} invited you to join “${name}” for hcav, the world's second best scavenger hunt.\n\nhalloween weekend · october 30 – november 2, 2026. anywhere on earth.\n\nview the invitation: ${link}\n\nnot interested? stop hcav invitations: ${decline}\n\nthe organization of burlington, vermont`;
	try {
		if (channel === 'email') {
			await upsert('mail', {
				id,
				recipient: target,
				subject: 'you have been recruited for hcav',
				body,
				status: 'ready',
				created_at: new Date().toISOString()
			});
		} else {
			await checkBot();
			const info = await slack('users.info', { user: target });
			if (
				!info.user ||
				info.user.deleted ||
				info.user.is_bot ||
				info.user.team_id !== required('SLACK_TEAM_ID')
			)
				throw new Error('recipient unavailable');
			const conversation = await slack('conversations.open', { users: target });
			if (!conversation.channel?.id) throw new Error('missing conversation');
			await slack('chat.postMessage', {
				channel: conversation.channel.id,
				text: body,
				mrkdwn: false,
				parse: 'none',
				unfurl_links: false,
				unfurl_media: false
			});
		}
		db().prepare("UPDATE invitations SET status = 'submitted' WHERE hash = ?").run(id);
	} catch {
		// No automatic retry: a timeout can happen after the provider accepted the message.
		db().prepare("UPDATE invitations SET status = 'unknown' WHERE hash = ?").run(id);
		console.error('invitation delivery requires inspection', id);
	}
}

export async function resolveShared(secret: string) {
	if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) error(404, 'this invitation was not found.');
	const value = (await rows<Team>('teams', 'link_token', secret))[0];
	if (!value || !(Date.parse(value.link_expires) > Date.now()))
		error(410, 'this link expired or was replaced. ask your team for a new one.');
	return value;
}

export async function resolveTargeted(secret: string, identity?: Identity | null) {
	const entry = invitation(secret);
	if (
		!entry ||
		entry.expires <= Date.now() ||
		['revoked', 'declined', 'accepted'].includes(entry.status)
	)
		error(410, 'this invitation expired or is no longer available. ask your team for a new one.');
	if (identity) {
		const matches =
			entry.channel === 'email'
				? identity.emailVerified && identity.email === entry.recipient
				: identity.slackId && identity.slackId === entry.recipient;
		if (!matches) error(403, 'sign in with the hack club account this invitation was sent to.');
	}
	const value = await team(entry.team_id);
	if (!value || value.captain_id !== entry.sender_id)
		error(410, 'this invitation is no longer available. ask the current captain for a new one.');
	return value;
}
