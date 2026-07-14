// src/client/scripts/esm/views/analysis/analysisenginebounds.ts

/**
 * Stores helpers for the HydroChess analysis-safe coordinate border.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';

/** The default HydroChess internal world border when none is specified in ICN. */
const ENGINE_WORLD_BORDER_DISTANCE = 1_000_000_000_000_000n; // 1e15

/** Returns the inclusive bounding box of the gamefile's world HydroChess can always evaluate. */
function getEngineWorldBorder(): BoundingBox {
	// No explicit world border in ICN: HydroChess uses fixed absolute fallback bounds.
	return {
		left: -ENGINE_WORLD_BORDER_DISTANCE,
		right: ENGINE_WORLD_BORDER_DISTANCE,
		bottom: -ENGINE_WORLD_BORDER_DISTANCE,
		top: ENGINE_WORLD_BORDER_DISTANCE,
	};
}

/** Returns whether all pieces in the gamefile are within the engine's safe evaluation bounds. */
function areAllPiecesInBounds(gamefile: GameFile): boolean {
	const engineBorder = getEngineWorldBorder();
	for (const x of gamefile.pieces.XPositions) {
		if (x < engineBorder.left || x > engineBorder.right) return false;
	}
	for (const y of gamefile.pieces.YPositions) {
		if (y < engineBorder.bottom || y > engineBorder.top) return false;
	}
	return true;
}

export default { getEngineWorldBorder, areAllPiecesInBounds };
