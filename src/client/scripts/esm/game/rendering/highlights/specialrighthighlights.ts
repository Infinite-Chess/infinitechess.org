
import { createModel, createModel_Instanced } from "../buffermodel.js";
import gameslot from "../../chess/gameslot.js";
// @ts-ignore
import legalmoveshapes from "../legalmoveshapes.js";
// @ts-ignore
import movement from "../movement.js";
import coordutil from "../../../chess/util/coordutil.js";
// @ts-ignore
import statustext from "../../gui/statustext.js";
import frametracker from "../frametracker.js";

// Type Definitions -----------------------------------------------------------------------------

import type { Coords, CoordsKey } from "../../../chess/util/coordutil.js";
// @ts-ignore
import type { gamefile } from "../../../chess/logic/gamefile.js";
import type { Vec3 } from "../../../util/math.js";

// Variables -------------------------------------------------------------------------------------

let DEBUG = false;

// Functions -------------------------------------------------------------------------------------

function toggleDebug() {
	DEBUG = !DEBUG;
	statustext.showStatus(`Toggled special right highlights: ${DEBUG}`, false, 0.5);
	frametracker.onVisualChange();
}

function renderSpecialRights(gamefile: gamefile, position: Vec3, scale: Vec3)
{
	const squaresToHighlight: Array<number> = [];
	for (const key in gamefile.specialRights) {
		if (!gamefile.specialRights[key]) continue;
		squaresToHighlight.push(...coordutil.getCoordsFromKey(key as CoordsKey));
	}
	const color = [1, 0.2, 0, 0.7] as [number, number, number, number];
	const vertexData: number[] = legalmoveshapes.getDataLegalMoveCornerTris(color);
	const model = createModel_Instanced(vertexData, squaresToHighlight, "TRIANGLES", true);
	
	model.render(position, scale);
}

function renderEnPassant(gamefile: gamefile, position: Vec3, scale: Vec3) {
	if (!gamefile.enpassant) return;
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

function render() {
	if (!DEBUG) return;
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

export default {
	toggleDebug,
	render,
}