// build/plugins.js

/**
 * Contains shared esbuild plugins used in both client and server builds.
 */

/** An esbuild plugin that logs whenever a build is finished. */
export function getESBuildLogStatusLogger(successMessage, failureMessage) {
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
