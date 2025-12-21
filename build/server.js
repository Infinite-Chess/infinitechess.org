// build/server.js

import esbuild from 'esbuild';
import { glob } from 'glob';

// ================================= CONSTANTS =================================

const entryPoints = await glob(['src/server/**/*.{ts,js}', 'src/shared/**/*.{ts,js}'], {
	ignore: ['**/*.test.{ts,js}'],
});

// ================================= BUILDING ===================================

/** An esbuild plugin that logs whenever a build is finished. */
function getESBuildLogRebuildPlugin(successMessage, failureMessage) {
	return {
		name: 'log-rebuild',
		setup(build) {
			// This hook runs when a build has finished
			build.onEnd((result) => {
				if (result.errors.length > 0) console.error(failureMessage);
				else console.log(successMessage);
			});
		},
	};
}

const esbuildServerRebuildPlugin = getESBuildLogRebuildPlugin(
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
