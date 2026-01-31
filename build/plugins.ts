// build/plugins.ts

/**
 * Contains shared esbuild plugins used in both client and server builds.
 */

import type { Plugin } from 'esbuild';

/** Returns an esbuild plugin that logs whenever a build finishes/fails. */
export function getESBuildLogStatusLogger(successMessage: string, failureMessage: string): Plugin {
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
