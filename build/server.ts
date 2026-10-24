// build/server.ts

/**
 * The server build: transpiles every server and shared script 1:1 into /dist, unbundled.
 */

import { glob } from 'glob';
import esbuild, { BuildOptions } from 'esbuild';

import { getESBuildLogStatusLogger } from './plugins.js';

// Constants -------------------------------------------------------------------

const ENTRY_POINTS = await glob(['src/server/**/*.{ts,js}', 'src/shared/**/*.{ts,js}'], {
	ignore: ['**/*.test.{ts,js}'],
});

// Options ---------------------------------------------------------------------

const BuildLogPlugin = getESBuildLogStatusLogger(
	'✅ Server Build successful.',
	'❌ Server Build failed.',
);

const BUILD_OPTIONS: BuildOptions = {
	// Transpile all TS files from BOTH directories
	entryPoints: ENTRY_POINTS,
	platform: 'node',
	bundle: false, // No bundling for the server. Just transpile each file individually
	outdir: 'dist',
	format: 'esm',
	sourcemap: true, // Patches file paths from server console errors to the correct src/ file
	plugins: [BuildLogPlugin],
};

// Building --------------------------------------------------------------------

/** Builds the server's scripts once, or in dev, on every change. */
export async function buildServer(isDev: boolean): Promise<void> {
	const context = await esbuild.context(BUILD_OPTIONS);

	if (isDev) {
		await context.watch();
	} else {
		await context.rebuild();
		context.dispose();
	}
}
