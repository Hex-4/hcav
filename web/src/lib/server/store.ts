import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { error } from '@sveltejs/kit';
import { type Identity, setting } from './config';

let connection: DatabaseSync;
export function db() {
	if (!connection) {
		const path = setting('SQLITE_PATH') || './data/hcav.sqlite';
		let database: DatabaseSync | undefined;
		try {
			mkdirSync(dirname(path), { recursive: true });
			database = new DatabaseSync(path);
			database.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA busy_timeout = 5000;
			CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, identity TEXT NOT NULL, expires INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS oauth (hash TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS limits (bucket TEXT NOT NULL, at INTEGER NOT NULL);
			CREATE INDEX IF NOT EXISTS limits_lookup ON limits(bucket, at);
			CREATE TABLE IF NOT EXISTS slack_commands (
				id TEXT PRIMARY KEY, payload TEXT NOT NULL, at INTEGER NOT NULL,
				attempts INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE IF NOT EXISTS channel_jobs (
				user_id TEXT NOT NULL, channel_id TEXT NOT NULL, team_id TEXT NOT NULL,
				at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
				status TEXT NOT NULL DEFAULT 'pending', problem TEXT NOT NULL DEFAULT '',
				PRIMARY KEY(user_id, channel_id)
			);
			`);
			connection = database;
		} catch (cause) {
			database?.close();
			console.error('sqlite initialization failed', path, cause);
			throw cause;
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

// Checks and reservations succeed together. Rolling windows survive restarts.
export function reserve(buckets: { key: string; window: number; max: number }[]) {
	const sql = db();
	const now = Date.now();
	sql.exec('BEGIN IMMEDIATE');
	try {
		sql.prepare('DELETE FROM limits WHERE at <= ?').run(now - 7 * 86400_000);
		for (const bucket of buckets) {
			const row = sql
				.prepare('SELECT COUNT(*) AS count FROM limits WHERE bucket = ? AND at > ?')
				.get(bucket.key, now - bucket.window);
			if (Number(row?.count) >= bucket.max) error(429, 'Please wait a moment before trying again.');
		}
		const insert = sql.prepare('INSERT INTO limits VALUES (?, ?)');
		for (const key of new Set(buckets.map((bucket) => bucket.key))) insert.run(key, now);
		sql.exec('COMMIT');
	} catch (cause) {
		sql.exec('ROLLBACK');
		throw cause;
	}
}

// Airtable has no compare-and-swap. Run exactly one application process.
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
	db()
		.prepare('DELETE FROM slack_commands WHERE done = 1 AND at < ?')
		.run(now - 86400_000);
}
