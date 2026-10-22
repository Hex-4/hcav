import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: '*.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	outputDir: '../.amp/in/test-results',
	use: { baseURL: 'http://localhost:5174', headless: true, trace: 'retain-on-failure' },
	webServer: {
		command: 'bun run build && bun --preload ./tests/providers.mjs ./build/index.js',
		url: 'http://localhost:5174',
		reuseExistingServer: false,
		env: {
			NODE_ENV: 'test',
			HOST: 'localhost',
			PORT: '5174',
			APP_ORIGIN: 'http://localhost:5174',
			AIRTABLE_TOKEN: 'test-only',
			AIRTABLE_BASE_ID: 'test-only',
			HCA_CLIENT_ID: 'test-client',
			HCA_CLIENT_SECRET: 'test-secret',
			SLACK_BOT_TOKEN: 'test-only',
			SLACK_TEAM_ID: 'TTEST00001',
			SLACK_SIGNING_SECRET: 'test-signing-secret',
			SQLITE_PATH: '../.amp/in/test.sqlite'
		}
	}
});
