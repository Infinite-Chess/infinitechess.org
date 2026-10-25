// src/server/config/manifest.ts

/**
 * Loads and caches the build's asset manifest (dist/manifest.json), which maps
 * source files to their content-hashed output names, and exposes the engine version.
 */

import type { EngineAssets } from '../../shared/chess/util/engineregistry.js';

import fs from 'fs';
import path from 'path';

// Constants -------------------------------------------------------------------

const PATH = path.join(process.cwd(), 'dist/manifest.json');

// State -----------------------------------------------------------------------

let manifest: Record<string, string> | undefined;

// Functions -------------------------------------------------------------------

/** Loads the built asset manifest, replacing the cached record. */
function load(): Record<string, string> {
	if (!fs.existsSync(PATH)) throw new Error('Manifest file not found. Did we build first?');
	const loadedManifest = JSON.parse(fs.readFileSync(PATH, 'utf8')) as Record<string, string>; // prettier-ignore
	manifest = loadedManifest;
	return loadedManifest;
}

/** Returns the loaded asset manifest. */
function get(): Record<string, string> {
	if (!manifest) throw new Error('Asset manifest has not been loaded.');
	return manifest;
}

/** Returns the engine's version string from the manifest. */
function getEngineVersion(): string {
	const version = get()['engineVersion'];
	if (!version) throw new Error('Engine version missing from asset manifest.');
	return version;
}

/** Returns the engine glue's hashed web path, e.g. `/engine/1a2b3c4d/apeiron.js`. */
function getEngineUrl(): string {
	const engineUrl = get()['engine'];
	if (!engineUrl) throw new Error('Engine missing from asset manifest.');
	return engineUrl;
}

/** Returns the hashed URLs a client needs to run the engine inside the given worker script. */
function getEngineAssets(workerSource: string): EngineAssets {
	const workerUrl = get()[workerSource];
	if (!workerUrl) throw new Error('Engine worker missing from asset manifest.');
	return { workerUrl, engineUrl: getEngineUrl() };
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	PATH,
	// Functions
	load,
	getEngineVersion,
	getEngineUrl,
	getEngineAssets,
};
