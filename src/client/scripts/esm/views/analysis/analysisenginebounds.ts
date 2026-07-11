// src/client/scripts/esm/views/analysis/analysisenginebounds.ts

/**
 * Analysis-only helpers for the coordinate range HydroChess can safely evaluate.
 */

import type { Coords } from '../../../../../shared/chess/util/coordutil.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';

import bounds from '../../../../../shared/util/math/bounds.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';

import { engineDictionary } from '../../game/chess/engines/engine.js';

const ENGINE_WORLD_BORDER_DISTANCE = engineDictionary.hydrochess.worldBorder;

function getEngineWorldBorder(gamefile: GameFile): BoundingBox {
	const box = gamefile.startSnapshot.box;
	return {
		left: box.left - ENGINE_WORLD_BORDER_DISTANCE,
		right: box.right + ENGINE_WORLD_BORDER_DISTANCE,
		bottom: box.bottom - ENGINE_WORLD_BORDER_DISTANCE,
		top: box.top + ENGINE_WORLD_BORDER_DISTANCE,
	};
}

function isCoordInsideEngineWorld(gamefile: GameFile, coords: Coords): boolean {
	return bounds.boxContainsSquare(getEngineWorldBorder(gamefile), coords);
}

function findFirstPieceOutsideEngineWorld(gamefile: GameFile): Coords | undefined {
	return boardutil
		.getCoordsOfAllPieces(gamefile.pieces)
		.find((coords) => !isCoordInsideEngineWorld(gamefile, coords));
}

export default {
	getEngineWorldBorder,
	isCoordInsideEngineWorld,
	findFirstPieceOutsideEngineWorld,
};
