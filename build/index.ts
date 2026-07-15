// build/index.ts

/**
 * This script deploys all files and assets from /src/client to /dist in order to run the website.
 *
 * Development mode: Transpile all TypeScript files to JavaScript.
 * Production mode: Transpile and bundle all TypeScript files to JavaScript, and minify via @swc/core.
 * 					Further, all css files are minified by lightningcss.
 */

import { setupEnv } from './env';
import { buildClient } from './client';
import { buildServer } from './server';
import { downloadEngineWasm, copyEngineToDist } from './engine-wasm';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

// Ensure .env file exists and has valid contents
setupEnv();

/** Whether additional minifying of bundled scripts and css files should be skipped. */
const USE_DEVELOPMENT_BUILD = process.argv.includes('--dev');

if (USE_DEVELOPMENT_BUILD && process.env['NODE_ENV'] === 'production') {
	throw new Error(
		"Cannot run build process with --dev flag when NODE_ENV environment variable is 'production'!",
	);
}

// Ensure the Apeiron WASM engine pkg is present on disk.
await downloadEngineWasm();
// Copy the engine pkg into dist (served unbundled — the rayon worker self-spawns from the glue's
// own URL, which bundling breaks). Must run before the client build so its content-hashed URL is
// included in the manifest that build writes.
copyEngineToDist();

// Build both client and server scripts
// Await all so the script doesn't finish and node terminate before esbuild is done.
await Promise.all([buildClient(USE_DEVELOPMENT_BUILD), buildServer(USE_DEVELOPMENT_BUILD)]);

// console.log('Build process finished.');
