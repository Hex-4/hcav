import { building } from '$app/env';
import { members, type Person, rows, type Team, team, upsert } from './airtable';
import { required, setting } from './config';
import { db, exclusive } from './store';

export const commonChannels = [
	{ id: 'C0BQ2GV0H0E', name: 'hcav' },
	{ id: 'C0CB9NR1N3W', name: 'hcav-submissions' }
];

type SlackResult = {
	ok: boolean;
	error?: string;
	team_id?: string;
	channel?: {
		id: string;
		name: string;
		creator?: string;
		is_member: boolean;
		is_archived: boolean;
		is_im?: boolean;
		is_mpim?: boolean;
	};
};

class SlackFailure extends Error {
	constructor(
		public code: string,
		public retryAfter = 0
	) {
		super(code);
	}
}

async function api(method: string, body: Record<string, string>): Promise<SlackResult> {
	const read = method === 'conversations.info';
	const response = await fetch(
		`https://slack.com/api/${method}${read ? `?${new URLSearchParams(body)}` : ''}`,
		{
			method: read ? 'GET' : 'POST',
			headers: {
				Authorization: `Bearer ${required('SLACK_BOT_TOKEN')}`,
				'Content-Type': 'application/json; charset=utf-8'
			},
			body: read ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(10_000)
		}
	);
	if (!response.ok)
		throw new SlackFailure(
			response.status === 429 ? 'ratelimited' : 'slack_unavailable',
			Number(response.headers.get('retry-after') || 30) * 1000
		);
	const result = (await response.json()) as SlackResult;
	if (!result.ok) throw new SlackFailure(result.error || 'slack_unavailable');
	return result;
}

let botChecked = false;
async function checkBot() {
	if (botChecked) return;
	if ((await api('auth.test', {})).team_id !== required('SLACK_TEAM_ID'))
		throw new SlackFailure('wrong_workspace');
	botChecked = true;
}

export function queueChannel(slackId: string, channelId: string, teamId = '', retry = false) {
	if (!slackId) return;
	db()
		.prepare(`INSERT INTO channel_jobs (user_id, channel_id, team_id, at) VALUES (?, ?, ?, ?)
		ON CONFLICT(user_id, channel_id) DO UPDATE SET team_id = excluded.team_id,
		at = excluded.at, attempts = 0, status = 'pending', problem = ''
		WHERE ? OR channel_jobs.status = 'cancelled'`)
		.run(slackId, channelId, teamId, Date.now(), Number(retry));
}

export async function queueChannels(slackId: string, teamId = '', retry = false) {
	for (const channel of commonChannels) queueChannel(slackId, channel.id, '', retry);
	const value = teamId ? await team(teamId) : undefined;
	if (value?.hq_channel_id) queueChannel(slackId, value.hq_channel_id, value.id, retry);
}

export function channelStatus(slackId: string, hqId = '') {
	const channels = [...commonChannels, ...(hqId ? [{ id: hqId, name: 'team hq' }] : [])];
	return channels.map((channel) => {
		const job = db()
			.prepare('SELECT status, problem FROM channel_jobs WHERE user_id = ? AND channel_id = ?')
			.get(slackId, channel.id);
		return {
			...channel,
			status: String(job?.status || 'pending'),
			problem: String(job?.problem || '')
		};
	});
}

type Command = { user: string; channel: string; responseUrl?: string; result?: string };
type ChannelJob = { user_id: string; channel_id: string; team_id: string; attempts: number };

async function setHq(command: Command) {
	return exclusive(async () => {
		const people = await rows<Person>('people', 'slack_id', command.user);
		if (people.length !== 1) return 'Sign in to HCAV with your linked Slack account first.';
		const value = people[0].team_id ? await team(people[0].team_id) : undefined;
		if (!value || value.captain_id !== people[0].id) return 'Only your team captain can set HQ.';
		if (commonChannels.some((channel) => channel.id === command.channel))
			return 'Choose a team channel, not one of the main HCAV channels.';
		const { channel } = await api('conversations.info', { channel: command.channel });
		if (!channel || channel.is_im || channel.is_mpim || channel.is_archived)
			return 'Choose an active public or private channel, not a DM.';
		if (!channel.is_member)
			return 'Invite The Organization bot to this channel, then run /hcav hq again.';
		if (channel.creator !== command.user)
			return 'You must have created this Slack channel to set it as HQ.';
		const bound = await rows<Team>('teams', 'hq_channel_id', command.channel);
		if (bound.some((other) => other.id !== value.id))
			return 'This channel is already another team’s HQ.';
		await upsert('teams', {
			id: value.id,
			hq_channel_id: channel.id,
			hq_channel_name: channel.name
		});
		for (const member of await members(value.id))
			queueChannel(member.slack_id || '', channel.id, value.id, true);
		return 'HQ set. We’re adding your teammates. Check /team on HCAV for channel status.';
	});
}

let running = false;
let started = false;
export function startSlackWorker() {
	if (building || started) return;
	started = true;
	setInterval(() => {
		void work();
	}, 1500).unref();
	void work();
}

async function work() {
	if (running || !setting('SLACK_BOT_TOKEN') || !setting('SLACK_TEAM_ID')) return;
	running = true;
	try {
		const command = db()
			.prepare('SELECT * FROM slack_commands WHERE done = 0 AND at <= ? ORDER BY at LIMIT 1')
			.get(Date.now());
		const job = command
			? undefined
			: (db()
					.prepare(
						"SELECT * FROM channel_jobs WHERE status = 'pending' AND at <= ? ORDER BY at LIMIT 1"
					)
					.get(Date.now()) as ChannelJob | undefined);
		if (!command && !job) return;
		try {
			await checkBot();
			if (command) {
				const payload = JSON.parse(String(command.payload)) as Command;
				if (!payload.result) {
					try {
						payload.result = await setHq(payload);
					} catch (cause) {
						const code = cause instanceof SlackFailure ? cause.code : 'service_unavailable';
						payload.result = `Could not confirm HQ (${code}). Check your team page, invite the bot to the channel, then try /hcav hq again.`;
					}
					// Retrying a confirmation must not reapply an old hq over a newer choice.
					db()
						.prepare('UPDATE slack_commands SET payload = ? WHERE id = ?')
						.run(JSON.stringify(payload), String(command.id));
				}
				if (payload.responseUrl) {
					const response = await fetch(payload.responseUrl, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json; charset=utf-8' },
						body: JSON.stringify({ response_type: 'ephemeral', text: payload.result }),
						redirect: 'error',
						signal: AbortSignal.timeout(10_000)
					});
					if (!response.ok)
						throw new SlackFailure(
							'command_response_failed',
							Number(response.headers.get('retry-after') || 30) * 1000
						);
				} else {
					// commands queued before response urls were stored still need a reply.
					await api('chat.postEphemeral', {
						channel: payload.channel,
						user: payload.user,
						text: payload.result
					});
				}
				db().prepare('UPDATE slack_commands SET done = 1 WHERE id = ?').run(String(command.id));
			} else if (job) {
				if (job.team_id) {
					const value = await team(job.team_id);
					const people = await rows<Person>('people', 'slack_id', job.user_id);
					if (
						value?.hq_channel_id !== job.channel_id ||
						!people.some((person) => person.team_id === job.team_id)
					) {
						db()
							.prepare(
								"UPDATE channel_jobs SET status = 'cancelled' WHERE user_id = ? AND channel_id = ?"
							)
							.run(job.user_id, job.channel_id);
						return;
					}
				}
				try {
					await api('conversations.invite', { channel: job.channel_id, users: job.user_id });
				} catch (cause) {
					if (!(cause instanceof SlackFailure && cause.code === 'already_in_channel')) throw cause;
				}
				db()
					.prepare(
						"UPDATE channel_jobs SET status = 'joined', problem = '' WHERE user_id = ? AND channel_id = ?"
					)
					.run(job.user_id, job.channel_id);
			}
		} catch (cause) {
			const attempts = Number(command?.attempts ?? job?.attempts ?? 0) + 1;
			const code = cause instanceof SlackFailure ? cause.code : 'service_unavailable';
			const next =
				Date.now() +
				Math.max(
					cause instanceof SlackFailure ? cause.retryAfter : 0,
					Math.min(3600_000, 15_000 * 2 ** Math.min(attempts, 8))
				);
			if (command)
				db()
					.prepare('UPDATE slack_commands SET attempts = ?, at = ?, done = ? WHERE id = ?')
					.run(attempts, next, Number(attempts >= 8), String(command.id));
			if (job)
				db()
					.prepare(
						'UPDATE channel_jobs SET attempts = ?, at = ?, status = ?, problem = ? WHERE user_id = ? AND channel_id = ?'
					)
					.run(
						attempts,
						next,
						attempts >= 8 ? 'failed' : 'pending',
						code,
						job.user_id,
						job.channel_id
					);
			console.error('slack channel work deferred', code);
		}
	} catch (cause) {
		console.error('slack queue unavailable', cause);
	} finally {
		running = false;
	}
}
