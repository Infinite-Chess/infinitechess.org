// src/server/config/manifest.ts

import fs from 'fs';
import path from 'path';

const MANIFEST_PATH = path.join(process.cwd(), 'dist/manifest.json');

let manifest: Record<string, string> | undefined;

/** Loads the built asset manifest, replacing the cached record. */
function loadManifest(): Record<string, string> {
	if (!fs.existsSync(MANIFEST_PATH))
		throw new Error('Manifest file not found. Did we build first?');
	const loadedManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Record<
		string,
		string
	>;
	manifest = loadedManifest;
	return loadedManifest;
}

/** Returns the loaded asset manifest. */
function getManifest(): Record<string, string> {
	if (!manifest) throw new Error('Asset manifest has not been loaded.');
	return manifest;
}

function getEngineVersion(): string {
	const version = getManifest()['engineVersion'];
	if (!version) throw new Error('Engine version missing from asset manifest.');
	return version;
}

export { MANIFEST_PATH, loadManifest, getManifest, getEngineVersion };
