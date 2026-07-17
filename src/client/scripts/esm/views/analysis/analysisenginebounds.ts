// src/client/scripts/esm/views/analysis/analysisenginebounds.ts

/**
 * Stores helpers for the Apeiron analysis-safe coordinate border.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';
import coordutil, { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';
import { engineDictionary } from '../../../../../shared/chess/engine.js';

/**
 * Absolute fallback border distance for a side the position leaves unbounded — the largest
 * coordinate Apeiron can safely evaluate (i64 minus a little wiggle room). Matches the
 * distance engine games hand the engine, so analysis stays within the same safe range.
 */
const DEFAULT_BORDER_DISTANCE = engineDictionary.apeiron.worldBorder;

/**
 * The world border Apeiron evaluates the position within: the position's own `worldBorder`
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

/** Whether every piece coordinate in `position` lies within `border` (inclusive). */
function positionInBounds(position: Map<CoordsKey, number>, border: BoundingBox): boolean {
	for (const key of position.keys()) {
		const [x, y] = coordutil.getCoordsFromKey(key);
		if (x < border.left || x > border.right || y < border.bottom || y > border.top) return false;
	}
	return true;
}

/**
 * The earliest ply (0 = game start) from which every position up to the viewed one stays in the
 * engine's safe (replayable) coordinate range. An out-of-range historical position would overflow
 * i64 on replay, silently corrupting the engine's board/repetition state, so we skip past it.
 */
function getSafeStartPly(gamefile: GameFile): number {
	const border = getEngineWorldBorder(gamefile);
	const position = jsutil.deepCopyObject(gamefile.startSnapshot.position);
	const viewedPlyCount = gamefile.state.local.moveIndex + 1;

	let lastOutOfBoundsPly = positionInBounds(position, border) ? -1 : 0;
	for (let i = 0; i < viewedPlyCount; i++) {
		boardchanges.runChanges_Position(position, gamefile.moves[i]!.changes);
		if (!positionInBounds(position, border)) lastOutOfBoundsPly = i + 1;
	}
	return lastOutOfBoundsPly + 1;
}

export default { getEngineWorldBorder, areAllPiecesInBounds, getSafeStartPly };
