// scripts/setup-engine.ts

/**
 * Standalone entry to fetch the Apeiron engine wasm without a full build.
 *
 * Exists so source-only CI jobs (e.g. import-rules) can resolve the gitignored
 * wasm imports, which are otherwise only downloaded by the full build.
 */

import { downloadEngineWasm } from '../build/engine-wasm';

await downloadEngineWasm();
