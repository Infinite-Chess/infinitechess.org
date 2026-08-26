// vitest.config.ts

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['src/tests/testsSetup.ts'],
		include: ['**/*.test.ts', '**/*.test.js'],
		exclude: ['.worktrees', 'node_modules', 'dist'],
	},
});
