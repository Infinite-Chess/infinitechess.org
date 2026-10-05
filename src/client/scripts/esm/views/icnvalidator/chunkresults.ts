// src/client/scripts/esm/views/icnvalidator/chunkresults.ts

/**
 * Creates and merges the ICN validator's failure tallies. Holds no chess
 * logic, so the page can merge its workers' tallies without bundling it.
 */

import type { ChunkResults } from './icnvalidatorprotocol.js';

// Tallies ---------------------------------------------------------------------

/** Tallies with nothing counted yet. */
function create(): ChunkResults {
	return {
		successfulCount: 0,
		icnconverterErrors: 0,
		formulatorErrors: 0,
		illegalMoveErrors: 0,
		movegenMismatchErrors: 0,
		terminationMismatchErrors: 0,
		errors: [],
		variantErrors: {},
	};
}

/** Adds one chunk's tallies into a running total. */
function merge(total: ChunkResults, chunk: ChunkResults): void {
	total.successfulCount += chunk.successfulCount;
	total.icnconverterErrors += chunk.icnconverterErrors;
	total.formulatorErrors += chunk.formulatorErrors;
	total.illegalMoveErrors += chunk.illegalMoveErrors;
	total.movegenMismatchErrors += chunk.movegenMismatchErrors;
	total.terminationMismatchErrors += chunk.terminationMismatchErrors;

	total.errors.push(...chunk.errors);

	for (const [variant, stats] of Object.entries(chunk.variantErrors)) {
		const existing = total.variantErrors[variant];
		if (!existing) {
			total.variantErrors[variant] = { ...stats };
			continue;
		}
		existing.total += stats.total;
		existing.icn += stats.icn;
		existing.formulator += stats.formulator;
		existing.illegal += stats.illegal;
		existing.movegen += stats.movegen;
		existing.termination += stats.termination;
	}
}

// Exports ---------------------------------------------------------------------

export default {
	// Tallies
	create,
	merge,
};
