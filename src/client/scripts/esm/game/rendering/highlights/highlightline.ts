
/**
 * This script renders our single-line legal sliding moves
 * when we are zoomed out far.
 */

// Import Start
import input from '../../input.js';
import bufferdata from '../bufferdata.js';
import perspective from '../perspective.js';
import board from '../board.js';
import transition from '../transition.js';
import selection from '../../chess/selection.js';
import camera from '../camera.js';
import math, { Color } from '../../../util/math.js';
import movement from '../movement.js';
import { createModel } from '../buffermodel.js';
import jsutil from '../../../util/jsutil.js';
import coordutil, { Coords } from '../../../chess/util/coordutil.js';
import space from '../../misc/space.js';
import spritesheet from '../spritesheet.js';
import preferences from '../../../components/header/preferences.js';
import guipause from '../../gui/guipause.js';
import snapping from './snapping.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('../buffermodel.js').BufferModel} BufferModel
 * @typedef {import('../../../util/math.js').BoundingBox} BoundingBox
 */

/** The buffer model of the legal move lines when zoomed out.
 * @type {BufferModel} */
let modelLines;

/** The buffer model of the mini piece that is
 * rendered when hovering over the legal move line.
 * @type {BufferModel} */
let modelGhost;

const perspectiveLimitToTeleport = 50;

const opacityOfGhostImage = 1;


/** A single highlight line */
interface Line {
	/** The starting point coords. */
	start: Coords
	/** The ending point coords. */
	end: Coords
	/** The equation of the line in general form. */
	coefficients: [number, number, number]
	/** The color of the line. */
	color: Color
	/** The piece type that should be displayed when hovering over the line, if there is one. */
	piece: number
}



// Also tests to see if the line is being hovered over, or clicked to transition.
function genModel() {

	const dataLines = [];

	const entityWorldWidth = snapping.getEntityWidthWorld();

    
	modelLines = createModel(dataLines, 2, "LINES", true);

	// Ghost image...

	if (perspective.getEnabled() && !perspective.isMouseLocked()) return;

	modelGhost = undefined;

	// In the future we'll still need to pass this point if we've got
	// key points that would trump clicking pieces
	if (snapping.isHoveringAtleastOneEntity()) return;

	if (!closestPoint) return; // There were no snapping points, the mouse is not next to a line.
	// Generate the ghost image model

	const dataGhost = [];

	const type = selection.getPieceSelected().type;

	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);

	const halfWidth = entityWorldWidth / 2;

	const startX = closestPoint.coords[0] - halfWidth;
	const startY = closestPoint.coords[1] - halfWidth;
	const endX = startX + entityWorldWidth;
	const endY = startY + entityWorldWidth;

	const data = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, 1, 1, 1, opacityOfGhostImage);

	dataGhost.push(...data);
    
	modelGhost = createModel(dataGhost, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
    
	// If we clicked, teleport to the point on the line closest to the click location.
	// BUT we have to recalculate it in coords format instead of world-space

	if (input.isMouseDown_Left()) input.removeMouseDown_Left(); // Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
	if (!input.getPointerClicked()) return; // Pointer did not click, we will not teleport down to this linee

	const moveset = closestPoint.moveset;

	boundingBox = perspective.getEnabled() ? board.generatePerspectiveBoundingBox(perspectiveLimitToTeleport) : board.gboundingBox();

	const line = closestPoint.line;
	const lineIsVertical = line[0] === 0;
	
	const intersectionPoints = math.findLineBoxIntersections(pieceCoords, line, boundingBox).map(intersection => intersection.coords);

	const leftLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, moveset, line, false);
	intersectionPoints[0] = capPointAtSlideLimit(intersectionPoints[0], leftLimitPointCoord, false, lineIsVertical);

	const rightLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, moveset, line, true);
	intersectionPoints[1] = capPointAtSlideLimit(intersectionPoints[1], rightLimitPointCoord, true, lineIsVertical);

	let tileMouseFingerOver;
	if (input.getTouchClicked()) { // Set to what the finger tapped above
		const tileMouseOver = board.getTileMouseOver(); // { tile_Float, tile_Int }
		tileMouseFingerOver = tileMouseOver.tile_Int;
	} else tileMouseFingerOver = board.gtile_MouseOver_Int();

	const closestCoordCoords = math.closestPointOnLine(intersectionPoints[0], intersectionPoints[1], tileMouseFingerOver).coords;

	const tel = { endCoords: closestCoordCoords, endScale: 1 };
	// console.log("teleporting to " + closestCoordCoords)
	transition.teleport(tel);
}





function genLinesModel(lines: Line[]) {
	const data: number[] = lines.flatMap(line => getLineData(line));
	return createModel(data, 2, 'TRIANGLES', true);
}

function getLineData(line: Line) {
	const startWorld = space.convertCoordToWorldSpace(line.start);
	const endWorld = space.convertCoordToWorldSpace(line.end);
	const [ r, g, b, a ] = line.color;
	return [
		//         Vertex                 Color
		startWorld[0], startWorld[1],   r, g, b, a,
		endWorld[0], endWorld[1],       r, g, b, a
	];
}

// Renders the legal slide move lines, and ghost image if hovering
function render() {
	if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
	if (!selection.isAPieceSelected()) return;
	if (!modelLines) { console.log("No highlightline model to render!"); return; }

	// render.renderModel(modelLines, undefined, undefined, "LINES")
	modelLines.render();

	// if (modelGhost) render.renderModel(modelGhost, undefined, undefined, "TRIANGLES", spritesheet.getSpritesheet())
	if (modelGhost) modelGhost.render();
}

export default {
	update,

	genLinesModel,
};

export type {
	Line,
}