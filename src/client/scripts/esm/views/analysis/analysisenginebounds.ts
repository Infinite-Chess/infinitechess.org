// src/client/scripts/esm/views/analysis/analysisenginebounds.ts

/**
 * Stores helpers for the HydroChess analysis-safe coordinate border.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';

import { engineDictionary } from '../../game/chess/engines/engine.js';

/**
 * Absolute fallback border distance for a side the position leaves unbounded — the largest
 * coordinate HydroChess can safely evaluate (i64 minus a little wiggle room). Matches the
 * distance engine games hand the engine, so analysis stays within the same safe range.
 */
const DEFAULT_BORDER_DISTANCE = engineDictionary.hydrochess.worldBorder;

/**
 * The world border HydroChess evaluates the position within: the position's own `worldBorder`
 * gamerule where defined, falling back to ±{@link DEFAULT_BORDER_DISTANCE} on any unbounded side.
 * (Unlike engine games, the fallback is absolute — not offset from the piece bounding box.)
 */
function getEngineWorldBorder(gamefile: GameFile): BoundingBox {
	const wb = gamefile.gameRules.worldBorder;
	return {
		left: wb?.left ?? -DEFAULT_BORDER_DISTANCE,
		right: wb?.right ?? DEFAULT_BORDER_DISTANCE,
		bottom: wb?.bottom ?? -DEFAULT_BORDER_DISTANCE,
		top: wb?.top ?? DEFAULT_BORDER_DISTANCE,
	};
}

/** Returns whether all pieces in the gamefile are within the engine's safe evaluation bounds. */
function areAllPiecesInBounds(gamefile: GameFile): boolean {
	const engineBorder = getEngineWorldBorder(gamefile);
	for (const x of gamefile.pieces.XPositions) {
		if (x < engineBorder.left || x > engineBorder.right) return false;
	}
	for (const y of gamefile.pieces.YPositions) {
		if (y < engineBorder.bottom || y > engineBorder.top) return false;
	}
	return true;
}

export default { getEngineWorldBorder, areAllPiecesInBounds };
