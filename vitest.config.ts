// vitest.config.ts

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		globalSetup: ['src/tests/testsGlobalSetup.ts'],
		setupFiles: ['src/tests/testsSetup.ts'],
		include: ['**/*.test.ts', '**/*.test.js'],
		exclude: ['.worktrees', 'node_modules', 'dist'],
	},
});
