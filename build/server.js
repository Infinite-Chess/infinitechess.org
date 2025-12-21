// build/server.js

import esbuild from 'esbuild';
import { glob } from 'glob';

// Local imports
import { getESBuildLogStatusLogger } from './plugins.js';

// ================================= CONSTANTS =================================

const entryPoints = await glob(['src/server/**/*.{ts,js}', 'src/shared/**/*.{ts,js}'], {
	ignore: ['**/*.test.{ts,js}'],
});

// ================================= BUILDING ===================================

const esbuildServerRebuildPlugin = getESBuildLogStatusLogger(
	'✅ Server Build successful.',
	'❌ Server Build failed.',
);

const esbuildOptions = {
	// Transpile all TS files from BOTH directories
	entryPoints: entryPoints,
	platform: 'node',
	bundle: false, // No bundling for the server. Just transpile each file individually
	outdir: 'dist',
	format: 'esm',
	sourcemap: true, // Patches file paths from server console errors to the correct src/ file
	plugins: [esbuildServerRebuildPlugin],
};

// ================================= BUILDING ===================================

/** Builds the server's scripts, transpiling them all into javascript (no bundling). */
export async function buildServer(isDev) {
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
