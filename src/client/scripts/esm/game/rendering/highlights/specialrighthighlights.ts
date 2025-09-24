
/**
 * This is a DEBUGGING script for rendering special right and enpassant highlights.
 * 
 * Enable by pressing `7`.
 */

import type { BDCoords, Coords } from "../../../../../../shared/chess/util/coordutil.js";
import type { Color } from "../../../../../../shared/util/math/math.js";
import type { Vec3 } from "../../../../../../shared/util/math/vectors.js";


// @ts-ignore
import statustext from "../../gui/statustext.js";
import gameslot from "../../chess/gameslot.js";
import coordutil from "../../../../../../shared/chess/util/coordutil.js";
import frametracker from "../frametracker.js";
import legalmovemodel from "./legalmovemodel.js";
import boardpos from "../boardpos.js";
import legalmoveshapes from "../instancedshapes.js";
import piecemodels from "../piecemodels.js";
import squarerendering from "./squarerendering.js";
import meshes from "../meshes.js";
import { BufferModelInstanced, createModel_Instanced } from "../../../webgl/Renderable.js";



// Variables -------------------------------------------------------------------------------------


/** The color of the special rights indicator. */
const SPECIAL_RIGHTS_COLOR: Color = [0, 1, 0.5, 0.3];
/* The color of the enpassant indicator. */
const ENPASSANT_COLOR: Color = [0.5, 0, 1, 0.3];

/** Whether to render special right and enpassant highlights */
let enabled = false;
let model: BufferModelInstanced | undefined;


// Functions -------------------------------------------------------------------------------------

function enable(): void {
	enabled = true;
	regenModel();
	frametracker.onVisualChange();
}

function disable(): void {
	enabled = false;
	regenModel();
	frametracker.onVisualChange();
}

function toggle(): void {
	enabled = !enabled;
	statustext.showStatus(`Toggled special rights highlights: ${enabled}`, false, 0.5);
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

	// console.log("Regenerating specialrights model");
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
	model = createModel_Instanced(vertexData, piecemodels.castBigIntArrayToFloat32(squaresToHighlight), "TRIANGLES", 'colorInstanced', true);
}

function renderSpecialRights(): void {
	if (!model) throw Error("Specialrights model not initialized");

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
	squarerendering.genModel([gamefile.boardsim.state.global.enpassant.square], ENPASSANT_COLOR).render(undefined, undefined, { u_size });
}

/**
 * Called when any forward-global-move is made in the game, us or our opponent.
 * 
 * This does not count rewinding/forwarding (which are local changes),
 * nor does it count simulated moves, or moves only made using movepiece.makeMove() and then reverted.
 */
function onMove(): void {
	// console.log("On move");
	regenModel();
}

/** Erase the model so it doesn't carry over to next loaded game */
function onGameClose(): void {
	model = undefined;
}


// Exports -----------------------------------------------------------------------


export default {
	enable,
	disable,
	toggle,
	render,
	regenModel,
	onMove,
	onGameClose,
};