import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			// Pinned so the suite never inherits a developer's local `.env*`
			// file (which Wrangler loads as vars and sets ENVIRONMENT=dev):
			// tests opt into local mode explicitly via loadLocalWorker().
			miniflare: { bindings: { ENVIRONMENT: 'test' } },
		}),
	],
});
