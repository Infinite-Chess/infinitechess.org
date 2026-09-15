// src/server/config/nunjucks.ts

/**
 * Owns the one Nunjucks environment, which renders both the site's pages and its emails,
 * and configures it as the Express app's view engine.
 */

import type { Application } from 'express';

import fs from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';
import { fileURLToPath } from 'node:url';

import engineregistry from '../../shared/chess/util/engineregistry.js';
import { players as p } from '../../shared/chess/util/typeutil.js';

import env from './env.js';
import manifest from './manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Environment -----------------------------------------------------------------

// Templates live in src/server/views/, copied to dist/ by cpx. Outside production they're re-read on
// every render rather than watched: a watcher would keep alive any process that imports this.
const nunjucksEnv = new nunjucks.Environment(
	new nunjucks.FileSystemLoader(path.join(__dirname, '../views'), {
		noCache: env.NODE_ENV !== 'production',
	}),
	{ autoescape: true, throwOnUndefined: env.NODE_ENV !== 'production' },
);

// Express ---------------------------------------------------------------------

/**
 * Configures Nunjucks as the view engine for the given Express app,
 * and injects the asset manifest as a template global.
 */
function configure(app: Application): void {
	app.set('view engine', 'njk');
	nunjucksEnv.express(app);

	setManifestGlobals(manifest.load());
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
	if (env.NODE_ENV !== 'production') {
		fs.watch(manifest.PATH, () => {
			try {
				setManifestGlobals(manifest.load());
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
function setManifestGlobals(assets: Record<string, string>): void {
	nunjucksEnv.addGlobal('manifest', assets);
	nunjucksEnv.addGlobal(
		'engineNameVersioned',
		engineregistry.getVersionedName('apeiron', manifest.getEngineVersion()),
	);
}

// Rendering -------------------------------------------------------------------

/** Renders a template outside of any request, such as an email body. */
function render(templateName: string, context: object): string {
	return nunjucksEnv.render(templateName, context);
}

// Exports ---------------------------------------------------------------------

export default {
	// Express
	configure,
	// Rendering
	render,
};
