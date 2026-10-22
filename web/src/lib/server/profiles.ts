export type SlackProfile = { name: string; imageUrl: string; slackId: string };

const cache = new Map<string, { expires: number; value: Promise<SlackProfile> }>();

// Never fall back to an HCA name: it may be a legal name, not a public identity.
export async function profile(slackId = ''): Promise<SlackProfile> {
	const fallback = { name: slackId || 'Slack account not linked', imageUrl: '', slackId };
	if (!/^[UW][A-Z0-9]{8,20}$/.test(slackId)) return fallback;
	const saved = cache.get(slackId);
	if (saved && saved.expires > Date.now()) return saved.value;
	if (cache.size >= 1000) cache.delete(cache.keys().next().value as string);
	const value = (async () => {
		try {
			const response = await fetch(`https://cachet.dunkirk.sh/users/${slackId}`, {
				signal: AbortSignal.timeout(3000)
			});
			if (!response.ok) return fallback;
			const data = await response.json();
			const image = typeof data.imageUrl === 'string' ? new URL(data.imageUrl) : null;
			return {
				...fallback,
				name:
					typeof data.displayName === 'string' && data.displayName.trim()
						? data.displayName.trim().slice(0, 100)
						: slackId,
				imageUrl: image?.protocol === 'https:' ? image.href : ''
			};
		} catch {
			return fallback;
		}
	})();
	cache.set(slackId, { expires: Date.now() + 5 * 60_000, value });
	return value;
}
