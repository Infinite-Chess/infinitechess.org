// src/server/middleware/staticAssets.ts

/**
 * Serves static files as one unit in the middleware waterfall:
 *  - the built client bundle (scripts, css, images, audio, fonts), and
 *  - the ACME challenge directory used by Certbot to validate domain ownership.
 */

import path from 'path';
import express from 'express';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const staticAssets = express.Router();

// Serve public assets. (e.g. scripts, css, images, audio)
staticAssets.use(
	express.static(path.join(__dirname, '../../client'), {
		setHeaders(res, filePath) {
			if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
				// All JS and CSS files are content-hashed by esbuild (e.g. index-D3TD6A64.js).
				// The hash changes when content changes, so cached URLs never go stale.
				res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
			} else {
				// Other static assets (images, svgs, audio, fonts) are cached for 1 year
				// but not immutable — bump ?v=N in templates to bust the cache when they change.
				res.setHeader('Cache-Control', 'public, max-age=31536000');
			}
		},
	}),
);

// Directory required for the ACME (Automatic Certificate Management Environment)
// protocol used by Certbot to validate your domain ownership.
staticAssets.use(
	'/.well-known/acme-challenge',
	express.static(path.join(__dirname, '../../../cert/.well-known/acme-challenge')),
);

export default staticAssets;
