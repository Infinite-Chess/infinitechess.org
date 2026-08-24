// src/server/config/manifest.ts

/**
 * Loads and caches the build's asset manifest (dist/manifest.json), which maps
 * source files to their content-hashed output names, and exposes the engine version.
 */

import fs from 'fs';
import path from 'path';

// Constants ------------------------------------------------------------------

const PATH = path.join(process.cwd(), 'dist/manifest.json');

// State ----------------------------------------------------------------------

let manifest: Record<string, string> | undefined;

// Functions ------------------------------------------------------------------

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

// Exports --------------------------------------------------------------------

export default {
	// Constants
	PATH,
	// Functions
	load,
	get,
	getEngineVersion,
};
