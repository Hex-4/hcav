import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { error } from '@sveltejs/kit';
import { type Identity, inviteSeconds, setting } from './config';

let connection: DatabaseSync;
export function db() {
	if (!connection) {
		const path = setting('SQLITE_PATH') || './data/hcav.sqlite';
		mkdirSync(dirname(path), { recursive: true });
		connection = new DatabaseSync(path);
		connection.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA busy_timeout = 5000;
			CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, identity TEXT NOT NULL, expires INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS oauth (hash TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS limits (bucket TEXT NOT NULL, at INTEGER NOT NULL);
			CREATE INDEX IF NOT EXISTS limits_lookup ON limits(bucket, at);
			CREATE TABLE IF NOT EXISTS invitations (
				hash TEXT PRIMARY KEY, team_id TEXT NOT NULL, sender_id TEXT NOT NULL,
				channel TEXT NOT NULL, recipient TEXT NOT NULL, expires INTEGER NOT NULL,
				status TEXT NOT NULL DEFAULT 'reserved'
			);
			CREATE TABLE IF NOT EXISTS suppressed (recipient TEXT PRIMARY KEY);
			CREATE TABLE IF NOT EXISTS email_recipients (
				recipient TEXT PRIMARY KEY, team_id TEXT NOT NULL, at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS email_team_lookup ON email_recipients(team_id, at);
		`);
		// Preserve existing email reservations when upgrading, before invitation cleanup runs.
		const insert = connection.prepare('INSERT OR IGNORE INTO email_recipients VALUES (?, ?, ?)');
		for (const row of connection
			.prepare(
				"SELECT recipient, team_id, expires FROM invitations WHERE channel = 'email' ORDER BY expires"
			)
			.all()) {
			insert.run(
				recipientKey('email', String(row.recipient).trim().toLowerCase()),
				String(row.team_id),
				Number(row.expires) - inviteSeconds * 1000
			);
		}
	}
	return connection;
}

export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function saveSession(identity: Identity) {
	const value = token();
	db()
		.prepare('INSERT INTO sessions VALUES (?, ?, ?)')
		.run(hash(value), JSON.stringify(identity), Date.now() + 7 * 86400_000);
	return value;
}

export function session(value: string | undefined): Identity | null {
	if (!value) return null;
	const row = db()
		.prepare('SELECT identity FROM sessions WHERE hash = ? AND expires > ?')
		.get(hash(value), Date.now());
	return row ? JSON.parse(String(row.identity)) : null;
}

export function removeSession(value: string) {
	db().prepare('DELETE FROM sessions WHERE hash = ?').run(hash(value));
}

export function saveOAuth(value: string, payload: object) {
	db()
		.prepare('INSERT INTO oauth VALUES (?, ?, ?)')
		.run(hash(value), JSON.stringify(payload), Date.now() + 600_000);
}

export function takeOAuth(value: string) {
	const row = db()
		.prepare('DELETE FROM oauth WHERE hash = ? AND expires > ? RETURNING payload')
		.get(hash(value), Date.now());
	return row
		? (JSON.parse(String(row.payload)) as {
				state: string;
				nonce: string;
				verifier: string;
				next: string;
			})
		: null;
}

// A rolling window, shared by every route and persisted across restarts.
// All checks and reservations succeed together or none do.
export function reserve(
	buckets: { key: string; window: number; max: number }[],
	email?: { recipient: string; teamId: string }
) {
	const sql = db();
	const now = Date.now();
	sql.exec('BEGIN IMMEDIATE');
	try {
		sql.prepare('DELETE FROM limits WHERE at <= ?').run(now - 7 * 86400_000);
		if (email) {
			const previous = sql
				.prepare('SELECT 1 FROM email_recipients WHERE recipient = ?')
				.get(email.recipient);
			const daily = sql
				.prepare('SELECT COUNT(*) AS count FROM email_recipients WHERE team_id = ? AND at > ?')
				.get(email.teamId, now - 86400_000);
			if (previous || Number(daily?.count) >= 5)
				error(429, 'email invitation limit reached. share your team link instead.');
		}
		for (const bucket of buckets) {
			const row = sql
				.prepare('SELECT COUNT(*) AS count FROM limits WHERE bucket = ? AND at > ?')
				.get(bucket.key, now - bucket.window);
			if (Number(row?.count) >= bucket.max)
				error(429, 'the organization needs a moment. please wait before trying again.');
		}
		const insert = sql.prepare('INSERT INTO limits VALUES (?, ?)');
		for (const key of new Set(buckets.map((bucket) => bucket.key))) insert.run(key, now);
		if (email)
			sql
				.prepare('INSERT INTO email_recipients VALUES (?, ?, ?)')
				.run(email.recipient, email.teamId, now);
		sql.exec('COMMIT');
	} catch (cause) {
		sql.exec('ROLLBACK');
		throw cause;
	}
}

export type Invitation = {
	hash: string;
	team_id: string;
	sender_id: string;
	channel: 'email' | 'slack';
	recipient: string;
	expires: number;
	status: string;
};

export function invitation(value: string): Invitation | undefined {
	return db().prepare('SELECT * FROM invitations WHERE hash = ?').get(hash(value)) as
		| Invitation
		| undefined;
}

export const recipientKey = (channel: string, recipient: string) => hash(`${channel}:${recipient}`);

// Airtable does not provide compare-and-swap. Run exactly one application process.
// Serializing product mutations prevents concurrent join/create/transfer races.
let tail = Promise.resolve();
export async function exclusive<T>(work: () => Promise<T>): Promise<T> {
	const previous = tail;
	let release!: () => void;
	tail = new Promise<void>((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		return await work();
	} finally {
		release();
	}
}

export function cleanup() {
	const now = Date.now();
	db().prepare('DELETE FROM sessions WHERE expires < ?').run(now);
	db().prepare('DELETE FROM oauth WHERE expires < ?').run(now);
	// Retain tokens for 30 days after expiry to allow recipient opt-out.
	db()
		.prepare('DELETE FROM invitations WHERE expires < ?')
		.run(now - 30 * 86400_000);
}
