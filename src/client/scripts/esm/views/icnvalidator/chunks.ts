// src/client/scripts/esm/views/icnvalidator/chunks.ts

/**
 * The chunks the ICN validator splits a games json into, one per worker or CLI
 * child process, and the failure tallies they report back. Holds no chess logic,
 * so the page can split and merge without bundling it.
 */

import type { ChunkResults, ValidationRequest } from './icnvalidatorprotocol.js';

// Splitting -------------------------------------------------------------------

/** Splits the games into at most `count` chunks of near-equal size, tagging each game with its 1-based index. */
function split(games: string[], count: number): ValidationRequest['games'][] {
	const size = Math.ceil(games.length / count);
	const chunks: ValidationRequest['games'][] = [];
	for (let start = 0; start < games.length; start += size) {
		const slice = games.slice(start, start + size);
		chunks.push(slice.map((icn, i) => ({ index: start + i + 1, icn })));
	}
	return chunks;
}

// Tallies ---------------------------------------------------------------------

/** Tallies with nothing counted yet. */
function createResults(): ChunkResults {
	return {
		successfulCount: 0,
		icnconverterErrors: 0,
		formulatorErrors: 0,
		illegalMoveErrors: 0,
		movegenMismatchErrors: 0,
		terminationMismatchErrors: 0,
		errors: [],
		variantErrors: {},
		fingerprint: 0,
	};
}

/** Adds one chunk's tallies into a running total. */
function mergeResults(total: ChunkResults, chunk: ChunkResults): void {
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

	total.fingerprint = (total.fingerprint + chunk.fingerprint) >>> 0;
}

// Exports ---------------------------------------------------------------------

export default {
	// Splitting
	split,
	// Tallies
	createResults,
	mergeResults,
};
