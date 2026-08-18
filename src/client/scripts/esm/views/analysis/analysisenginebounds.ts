// src/client/scripts/esm/views/analysis/analysisenginebounds.ts

/**
 * Stores helpers for the Apeiron analysis-safe coordinate border.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import bounds from '../../../../../shared/util/math/bounds.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';
import apeiron_card from '../../../../../shared/chess/engines/apeiron_card.js';
import coordutil, { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';

/**
 * Absolute fallback border edge for a side the position leaves unbounded — the largest
 * coordinate Apeiron can safely evaluate (i64 minus a little wiggle room). The same cap
 * engine games clip their generated border to, so analysis and play agree on what's in range.
 */
const WORLD_BORDER_CAP = apeiron_card.WORLD_BORDER_CAP;

/**
 * The world border Apeiron evaluates the position within: the position's own `worldBorder`
 * gamerule where defined, falling back to ±{@link WORLD_BORDER_CAP} on any unbounded side.
 * (Unlike engine games, the fallback is absolute — not offset from the piece bounding box.)
 */
function getEngineWorldBorder(gamefile: GameFile): BoundingBox {
	const wb = gamefile.gameRules.worldBorder;
	return {
		left: wb?.left ?? -WORLD_BORDER_CAP,
		right: wb?.right ?? WORLD_BORDER_CAP,
		bottom: wb?.bottom ?? -WORLD_BORDER_CAP,
		top: wb?.top ?? WORLD_BORDER_CAP,
	};
}

/** Returns whether all pieces in the gamefile are within the engine's safe evaluation bounds. */
function areAllPiecesInBounds(gamefile: GameFile): boolean {
	const piecesBox = boardutil.getBoundingBoxOfAllPieces(gamefile.pieces);
	if (piecesBox === undefined) return true; // No pieces
	return bounds.boxContainsBox(getEngineWorldBorder(gamefile), piecesBox);
}

/** Whether every piece coordinate in `position` lies within `border` (inclusive). */
function positionInBounds(position: Map<CoordsKey, number>, border: BoundingBox): boolean {
	for (const key of position.keys()) {
		const [x, y] = coordutil.getCoordsFromKey(key);
		if (x < border.left || x > border.right || y < border.bottom || y > border.top)
			return false;
	}
	return true;
}

/**
 * For each ply 0…moves.length, the earliest ply from which every position up to it stays in the
 * engine's safe (replayable) coordinate range; index `i` is the safe start for the position after
 * `i` plies. An out-of-range historical position would overflow i64 on replay, silently corrupting
 * the engine's board/repetition state, so analysis skips past it. One forward pass over the history.
 */
function getSafeStartPlies(gamefile: GameFile, moves: MoveFull[]): number[] {
	const border = getEngineWorldBorder(gamefile);
	const position = jsutil.deepCopyObject(gamefile.startSnapshot.position);
	const safeStarts: number[] = new Array(moves.length + 1);

	let lastOutOfBoundsPly = positionInBounds(position, border) ? -1 : 0;
	safeStarts[0] = lastOutOfBoundsPly + 1;
	for (let i = 0; i < moves.length; i++) {
		boardchanges.runChanges_Position(position, moves[i]!.changes);
		if (!positionInBounds(position, border)) lastOutOfBoundsPly = i + 1;
		safeStarts[i + 1] = lastOutOfBoundsPly + 1;
	}
	return safeStarts;
}

/** The safe start ply for the currently viewed position (see {@link getSafeStartPlies}). */
function getSafeStartPly(gamefile: GameFile): number {
	return getSafeStartPlies(gamefile, gamefile.moves)[gamefile.state.local.moveIndex + 1]!;
}

export default { getEngineWorldBorder, areAllPiecesInBounds, getSafeStartPly, getSafeStartPlies };
