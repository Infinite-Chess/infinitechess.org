// src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts

/**
 * The ICN validator's worker. Loads the engine when the movegen check is
 * requested, then validates the chunk of games the page sends.
 */

import type { MovegenWasmModule } from './movegencheck.js';
import type { ValidationRequest, ValidationResponse } from './icnvalidatorprotocol.js';

import jsutil from '../../../../../shared/util/jsutil.js';

import enginewasm from '../../chess/enginewasm.js';
import chunkvalidator from './chunkvalidator.js';

// Message Handling ------------------------------------------------------------

/** Validates the chunk of games the page sends, posting progress along the way and the tallies at the end. */
self.onmessage = async (e: MessageEvent<ValidationRequest>) => {
	const { chunkId, games, engineUrl } = e.data;

	// One single-threaded engine per worker, for the movegen check
	let wasm: MovegenWasmModule | undefined;
	if (engineUrl !== undefined) {
		try {
			({ wasm } = await enginewasm.load<MovegenWasmModule>(engineUrl, 1));
		} catch (error) {
			console.error('[ICN Validator] Failed to initialize wasm', error);
			const message = `Engine failed to load: ${jsutil.getErrorMessage(error)}`;
			self.postMessage({ type: 'initerror', chunkId, message } satisfies ValidationResponse);
			return;
		}
	}

	const results = await chunkvalidator.validate(games, { wasm, fingerprint: false }, (count) =>
		self.postMessage({ type: 'progress', chunkId, count } satisfies ValidationResponse),
	);
	self.postMessage({ type: 'done', chunkId, results } satisfies ValidationResponse);
};
