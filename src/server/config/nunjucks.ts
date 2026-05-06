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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MANIFEST_PATH = path.join(process.cwd(), 'dist/manifest.json');

/**
 * Configures Nunjucks as the view engine for the given Express app,
 * and injects the asset manifest as a template global.
 */
export function configureNunjucks(app: Application): void {
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

	// Load the asset manifest (maps logical entry-point
	// names to their output paths, which are content-hashed.
	if (!fs.existsSync(MANIFEST_PATH))
		throw new Error('Manifest file not found. Did we build first?');
	nunjucksEnv.addGlobal('manifest', JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')));

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
		fs.watch(MANIFEST_PATH, () => {
			try {
				nunjucksEnv.addGlobal(
					'manifest',
					JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')),
				);
			} catch (_err) {
				// File may be mid-write; the next 'change' event will pick it up.
			}
		});
	}
}
