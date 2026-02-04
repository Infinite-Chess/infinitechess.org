// src/client/scripts/esm/game/rendering/highlights/specialrighthighlights.ts

/**
 * This is a DEBUGGING script for rendering special right and enpassant highlights.
 *
 * Enable by pressing `7`.
 */

import type { Vec3 } from '../../../../../../shared/util/math/vectors.js';
import type { Color } from '../../../../../../shared/util/math/math.js';
import type { BDCoords, Coords } from '../../../../../../shared/chess/util/coordutil.js';

import toast from '../../gui/toast.js';
import meshes from '../meshes.js';
import gameslot from '../../chess/gameslot.js';
import boardpos from '../boardpos.js';
import coordutil from '../../../../../../shared/chess/util/coordutil.js';
import piecemodels from '../piecemodels.js';
import frametracker from '../frametracker.js';
import legalmovemodel from './legalmovemodel.js';
import legalmoveshapes from '../instancedshapes.js';
import squarerendering from './squarerendering.js';
import { GameBus } from '../../GameBus.js';
import { RenderableInstanced, createRenderable_Instanced } from '../../../webgl/Renderable.js';

// Variables -------------------------------------------------------------------------------------

/** The color of the special rights indicator. */
const SPECIAL_RIGHTS_COLOR: Color = [0, 1, 0.5, 0.3];
/* The color of the enpassant indicator. */
const ENPASSANT_COLOR: Color = [0.5, 0, 1, 0.3];

/** Whether to render special right and enpassant highlights */
let enabled = false;
let model: RenderableInstanced | undefined;

// Events ----------------------------------------------------------------------------------------

GameBus.addEventListener('game-loaded', () => {
	regenModel();
});
GameBus.addEventListener('game-unloaded', () => {
	// Erase the model so it doesn't carry over to next loaded game
	model = undefined;
});
GameBus.addEventListener('physical-move', () => {
	regenModel();
});

// Functions -------------------------------------------------------------------------------------

function enable(): void {
	enabled = true;
	regenModel();
	frametracker.onVisualChange();
}

function disable(): void {
	enabled = false;
	frametracker.onVisualChange();
}

function toggle(): void {
	enabled = !enabled;
	toast.show(`Toggled special rights highlights: ${enabled}`, { durationMultiplier: 0.5 });
	regenModel();
	frametracker.onVisualChange();
}

function render(): void {
	if (!enabled) return; // Not enabled

	renderSpecialRights();
	renderEnPassant();
}

function regenModel(): void {
	if (!enabled) return; // Not enabled

	// console.log('Regenerating specialrights model');
	const gamefile = gameslot.getGamefile()!;
	const model_Offset: Coords = legalmovemodel.getOffset();
	// Instance data
	const squaresToHighlight: bigint[] = [];
	for (const key of gamefile.boardsim.state.global.specialRights) {
		const coords = coordutil.getCoordsFromKey(key);
		const offsetCoord = coordutil.subtractCoords(coords, model_Offset);
		squaresToHighlight.push(...offsetCoord);
	}
	// const vertexData: number[] = legalmoveshapes.getDataLegalMoveCornerTris(SPECIAL_RIGHTS_COLOR);
	// const vertexData: number[] = legalmoveshapes.getDataLegalMoveSquare(SPECIAL_RIGHTS_COLOR);
	const vertexData: number[] = legalmoveshapes.getDataPlusSign(SPECIAL_RIGHTS_COLOR);
	model = createRenderable_Instanced(
		vertexData,
		piecemodels.castBigIntArrayToFloat32(squaresToHighlight),
		'TRIANGLES',
		'colorInstanced',
		true,
	);
}

function renderSpecialRights(): void {
	if (!model) throw Error('Specialrights model not initialized');

	const boardPos: BDCoords = boardpos.getBoardPos();
	const offset: Coords = legalmovemodel.getOffset();
	const position: Vec3 = meshes.getModelPosition(boardPos, offset, 0);
	const boardScale: number = boardpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];

	model.render(position, scale);
}

function renderEnPassant(): void {
	const gamefile = gameslot.getGamefile()!;
	if (!gamefile.boardsim.state.global.enpassant) return; // No enpassant gamefile property

	const u_size = boardpos.getBoardScaleAsNumber();
	squarerendering
		.genModel([gamefile.boardsim.state.global.enpassant.square], ENPASSANT_COLOR)
		.render(undefined, undefined, { u_size });
}

// Exports -----------------------------------------------------------------------

export default {
	enable,
	disable,
	toggle,
	regenModel,
	render,
};
