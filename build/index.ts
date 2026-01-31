// build/index.ts

/**
 * This script deploys all files and assets from /src/client to /dist in order to run the website.
 *
 * Development mode: Transpile all TypeScript files to JavaScript.
 * Production mode: Transpile and bundle all TypeScript files to JavaScript, and minify via @swc/core.
 * 					Further, all css files are minified by lightningcss.
 */

import 'dotenv/config'; // Imports all properties of process.env, if it exists

import { setupEnv } from './env.js';
import { buildClient } from './client.js';
import { buildServer } from './server.js';
import { setupEngineWasm } from './engine-wasm.js';

// Ensure .env file exists and has valid contents
setupEnv();

/** Whether additional minifying of bundled scripts and css files should be skipped. */
const USE_DEVELOPMENT_BUILD = process.argv.includes('--dev');

if (USE_DEVELOPMENT_BUILD && process.env['NODE_ENV'] === 'production') {
	throw new Error(
		"Cannot run build process with --dev flag when NODE_ENV environment variable is 'production'!",
	);
}

// Ensure the HydroChess WASM engine is available
// Must be awaited since client build has a .wasm dependency on it.
await setupEngineWasm();

// Build both client and server scripts
// Await all so the script doesn't finish and node terminate before esbuild is done.
await Promise.all([buildClient(USE_DEVELOPMENT_BUILD), buildServer(USE_DEVELOPMENT_BUILD)]);

// console.log('Build process finished.');
