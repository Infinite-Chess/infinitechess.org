
/**
 * This is a DEBUGGING script for rendering special right and enpassant highlights.
 * 
 * Enable by pressing `7`.
 */

import { createModel, createModel_Instanced } from "../buffermodel.js";
import gameslot from "../../chess/gameslot.js";
import coordutil from "../../../chess/util/coordutil.js";
import frametracker from "../frametracker.js";
// @ts-ignore
import statustext from "../../gui/statustext.js";
// @ts-ignore
import movement from "../movement.js";
// @ts-ignore
import legalmoveshapes from "../legalmoveshapes.js";


// Type Definitions -----------------------------------------------------------------------------


import type { Coords, CoordsKey } from "../../../chess/util/coordutil.js";
import type { Vec3 } from "../../../util/math.js";
// @ts-ignore
import type { gamefile } from "../../../chess/logic/gamefile.js";


// Variables -------------------------------------------------------------------------------------


/** Whether to render special right and enpassant highlights */
let enabled = false;


// Functions -------------------------------------------------------------------------------------


function toggle() {
	enabled = !enabled;
	statustext.showStatus(`Toggled specialrights highlights: ${enabled}`, false, 0.5);
	frametracker.onVisualChange();
}

function render() {
	if (!enabled) return; // Not enabled

	const gamefile = gameslot.getGamefile()!;
	const boardPos: Coords = movement.getBoardPos();
	const position: Vec3 = [
		-boardPos[0],
		-boardPos[1],
		0
	];
	const boardScale: number = movement.getBoardScale();
	const scale: Vec3 = [boardScale, boardScale, 1];
	
	renderSpecialRights(gamefile, position, scale);
	renderEnPassant(gamefile, position, scale);
}

function renderSpecialRights(gamefile: gamefile, position: Vec3, scale: Vec3) {
	// Instance data
	const squaresToHighlight: Array<number> = [];
	for (const key in gamefile.specialRights) {
		const coords = coordutil.getCoordsFromKey(key as CoordsKey);
		squaresToHighlight.push(...coords);
	}
	const color = [1, 0.2, 0, 0.7] as [number, number, number, number];
	const vertexData: number[] = legalmoveshapes.getDataLegalMoveCornerTris(color);
	const model = createModel_Instanced(vertexData, squaresToHighlight, "TRIANGLES", true);
	
	model.render(position, scale);
}

function renderEnPassant(gamefile: gamefile, position: Vec3, scale: Vec3) {
	if (!gamefile.enpassant) return; // No enpassant gamefile property

	const color = [0.2, 1, 0, 0.7] as [number, number, number, number];
	const data = legalmoveshapes.getDataLegalMoveCornerTris(color);
	const model = createModel(data, 2, "TRIANGLES", true);
	const transformedPosition: Vec3 = [
		position[0] + gamefile.enpassant.square[0],
		position[1] + gamefile.enpassant.square[1],
		position[2]
	];
	model.render(transformedPosition, scale);
}


// Exports -----------------------------------------------------------------------


export default {
	toggle,
	render,
};