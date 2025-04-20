/**
 * HydroChess Engine - Rust WASM Version
 * A JavaScript wrapper for the Rust WASM implementation of HydroChess
 *
 * @author FirePlank
 */

import gameformulator from '../gameformulator.js';

// Import via dynamic import to avoid MIME type issues
let wasm;
let wasmInitialized = false;
let wasmInitPromise = null;

// Initializes the WASM module.
// @returns {Promise} Promise that resolves when the WASM module is initialized
async function initWasm() {
	if (!wasmInitPromise) {
		// Use full URL path derived from worker's origin
		const wasmModulePath = `${self.location.origin}/scripts/esm/game/chess/engines/hydrochess-wasm/pkg/hydrochess_wasm.js`;
		console.debug(`[Engine] Importing WASM glue code from: ${wasmModulePath}`);
		wasmInitPromise = import(wasmModulePath)
			.then(async module => {
				try {
					// Store the module for later use
					wasm = module;

					// Initialize the WASM module by calling the default export (init function)
					// This loads the actual WASM binary and sets up the bindgen
					console.debug('[Engine] Initializing HydroChess WASM module');
					await module.default();
					
					console.debug('[Engine] HydroChess WASM module initialized');
					wasmInitialized = true;
					postMessage("readyok"); // Signal that the engine is ready
					return true;
				} catch (error) {
					console.error('[Engine] Failed to initialize HydroChess WASM module', error);
					wasmInitialized = false;
					return false;
				}
			})
			.catch(err => {
				console.error('[Engine] Failed to import HydroChess WASM module', err);
				wasmInitialized = false;
				return false; // Explicitly return false on catch
			});
	}
	// Ensure the promise is awaited and the boolean result is returned
	return await wasmInitPromise;
}

// Initialize WASM when the module is loaded
initWasm();

// Main entry point for the engine
self.onmessage = async function(e) {
	const data = e.data;
	
	// Ensure WASM is initialized before processing commands
	if (!wasmInitialized) {
		const initialized = await initWasm();
		if (!initialized) {
			console.error("[Engine] WASM module failed to initialize");
			postMessage(null);
			return;
		}
	}

	try {
		// Formulate gamefile from logical format
		const current_gamefile = gameformulator.formulateGame(data.lf);

		if (!current_gamefile) {
			console.error("[Engine] Failed to formulate gamefile from data.lf");
			postMessage(null);
			return;
		}

		// Find the best move using wasm
		const bestMoveResult = wasm.find_best_move(current_gamefile);
		
		if (!bestMoveResult) {
			console.error('[Engine] No best move result returned from WASM');
			postMessage(null);
			return;
		}

		// return the best move
		postMessage(bestMoveResult);
	} catch (error) {
		console.error(`[Engine] Error finding best move:`, error);
		postMessage(null);
	}
};
