import { error } from '@sveltejs/kit';

export function setting(name: string): string {
	return process.env[name] || '';
}

export function required(name: string): string {
	const value = setting(name);
	if (!value) error(503, 'this service is not configured yet. please try again later.');
	return value;
}

export function origin(): string {
	const value = setting('APP_ORIGIN') || 'http://localhost:5173';
	const url = new URL(value);
	if (url.origin !== value || (url.protocol !== 'https:' && url.hostname !== 'localhost')) {
		throw new Error('APP_ORIGIN must be an https origin (or http://localhost for development)');
	}
	if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
		throw new Error('production requires an https APP_ORIGIN');
	}
	return value;
}

export const cookieName = 'hcav_session';
export const sessionSeconds = 60 * 60 * 24 * 7;
export const inviteSeconds = 60 * 60 * 24 * 14;

export type Identity = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	slackId: string;
	verified: boolean;
	eligible: boolean;
	authAt: number;
};
