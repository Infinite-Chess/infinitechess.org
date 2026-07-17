// build/plugins.ts

/**
 * Contains shared esbuild plugins used in both client and server builds.
 */

import type { Plugin, PluginBuild } from 'esbuild';

import fs from 'node:fs';
import path from 'node:path';

/** Returns an esbuild plugin that logs whenever a build finishes/fails. */
export function getESBuildLogStatusLogger(successMessage: string, failureMessage: string): Plugin {
	return {
		name: 'log-rebuild',
		setup(build: PluginBuild) {
			// This hook runs when a build has finished
			build.onEnd((result) => {
				if (result.errors.length > 0) console.error(failureMessage);
				else console.log(successMessage);
			});
		},
	};
}

/**
 * Returns an esbuild plugin that rewrites a sentinel file after every SUCCESSFUL build.
 * `onEnd` fires only once all output files are on disk, so dev watchers can gate on the
 * sentinel to know a (re)build is fully complete — avoiding the race where the unbundled
 * server starts/restarts before all its files exist. Skipped on failure, so nodemon keeps
 * running the last good build.
 */
export function getBuildCompleteSentinelPlugin(sentinelPath: string): Plugin {
	return {
		name: 'build-complete-sentinel',
		setup(build: PluginBuild) {
			build.onEnd((result) => {
				if (result.errors.length > 0) return;
				fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });
				fs.writeFileSync(sentinelPath, String(Date.now()));
			});
		},
	};
}
