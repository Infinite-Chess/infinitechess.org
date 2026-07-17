// build/server.ts

import { glob } from 'glob';
import esbuild, { BuildOptions } from 'esbuild';

import { getESBuildLogStatusLogger, getBuildCompleteSentinelPlugin } from './plugins.js';

/** Rewritten after every successful server build; dev watchers gate on it (see plugins.ts). */
export const SERVER_BUILD_COMPLETE_SENTINEL = 'dist/server/.build-complete';

// ================================= CONSTANTS =================================

const entryPoints = await glob(['src/server/**/*.{ts,js}', 'src/shared/**/*.{ts,js}'], {
	ignore: ['**/*.test.{ts,js}'],
});

// ================================= BUILDING ===================================

const esbuildServerRebuildPlugin = getESBuildLogStatusLogger(
	'✅ Server Build successful.',
	'❌ Server Build failed.',
);

const esbuildOptions: BuildOptions = {
	// Transpile all TS files from BOTH directories
	entryPoints: entryPoints,
	platform: 'node',
	bundle: false, // No bundling for the server. Just transpile each file individually
	outdir: 'dist',
	format: 'esm',
	sourcemap: true, // Patches file paths from server console errors to the correct src/ file
	plugins: [
		esbuildServerRebuildPlugin,
		getBuildCompleteSentinelPlugin(SERVER_BUILD_COMPLETE_SENTINEL),
	],
};

// ================================= BUILDING ===================================

/** Builds the server's scripts, transpiling them all into javascript (no bundling). */
export async function buildServer(isDev: boolean): Promise<void> {
	// console.log(`Building server in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode...`);

	const context = await esbuild.context(esbuildOptions);

	if (isDev) {
		await context.watch();
		// console.log('esbuild is watching for SERVER changes...');
	} else {
		await context.rebuild();
		context.dispose();
		// console.log('Server build complete.');
	}
}
