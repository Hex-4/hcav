import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			// The server hook enforces same-origin mutations, except the HMAC-signed
			// Slack webhook. Kit's pre-hook CSRF check has no per-route exemption.
			csrf: { trustedOrigins: ['*'] },
			paths: {
				origin:
					process.env.APP_ORIGIN ||
					(command === 'build' ? 'https://hcav.hackclub.community' : undefined)
			},
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	]
}));
