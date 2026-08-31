// src/server/config/nunjucks.ts

/**
 * Configures Nunjucks as the view engine for the Express app,
 * and injects the asset manifest as a template global.
 */

import type { Application } from 'express';

import fs from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';
import { fileURLToPath } from 'node:url';

import { players as p } from '../../shared/chess/util/typeutil.js';
import { getVersionedEngineName } from '../../shared/chess/util/engine.js';

import manifest from './manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Configures Nunjucks as the view engine for the given Express app,
 * and injects the asset manifest as a template global.
 */
function configure(app: Application): void {
	app.set('view engine', 'njk');

	// Configure Nunjucks as the view engine.
	// Templates live in src/server/views/ — copied to dist/server/views/ by the cpx
	// build step. Nunjucks watches dist/server/views/ in dev; cpx propagates src edits.
	const nunjucksEnv = nunjucks.configure(path.join(__dirname, '../views'), {
		autoescape: true,
		express: app,
		watch: process.env['NODE_ENV'] !== 'production', // Re-reads templates on change in dev mode
		throwOnUndefined: process.env['NODE_ENV'] !== 'production',
	});

	setManifestGlobals(nunjucksEnv, manifest.load());
	nunjucksEnv.addGlobal('p', p); // Player-color constants, so templates reference WHITE/BLACK by name

	// Serializes a value to JSON safe for inline <script> injection.
	// Escapes <, > and & to Unicode escapes so no HTML tag sequence can form.
	nunjucksEnv.addFilter('json', (value: unknown): string =>
		JSON.stringify(value)
			.replace(/</g, '\\u003c')
			.replace(/>/g, '\\u003e')
			.replace(/&/g, '\\u0026'),
	);

	// In dev, esbuild watch-mode rewrites manifest.json after every rebuild while the
	// server keeps running. Watch the file and refresh the Nunjucks global only when
	// it actually changes, so rendered HTML always references the current hashed filenames.
	if (process.env['NODE_ENV'] !== 'production') {
		fs.watch(manifest.PATH, () => {
			try {
				setManifestGlobals(nunjucksEnv, manifest.load());
			} catch (_err) {
				// File may be mid-write; the next 'change' event will pick it up.
			}
		});
	}
}

/**
 * Sets the manifest-derived template globals: the raw asset manifest, plus the
 * analysis engine's display name with its build-stamped version (e.g. "Apeiron 2.1"),
 */
function setManifestGlobals(env: nunjucks.Environment, assets: Record<string, string>): void {
	env.addGlobal('manifest', assets);
	env.addGlobal(
		'engineNameVersioned',
		getVersionedEngineName('apeiron', manifest.getEngineVersion()),
	);
}

// Exports ---------------------------------------------------------------------

export default { configure };
