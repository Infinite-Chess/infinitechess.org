
/**
 * This script renders our single-line legal sliding moves
 * when we are zoomed out far.
 */

// Import Start
import input from '../../input.js';
import bufferdata from '../bufferdata.js';
import perspective from '../perspective.js';
import miniimage from '../miniimage.js';
import board from '../board.js';
import transition from '../transition.js';
import options from '../options.js';
import selection from '../../chess/selection.js';
import camera from '../camera.js';
import math from '../../../util/math.js';
import movement from '../movement.js';
import { createModel } from '../buffermodel.js';
import jsutil from '../../../util/jsutil.js';
import coordutil from '../../../chess/util/coordutil.js';
import space from '../../misc/space.js';
import spritesheet from '../spritesheet.js';
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

// Also tests to see if the line is being hovered over, or clicked to transition.
function genModel() {
    
	if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
	if (!selection.isAPieceSelected()) return;

	const dataLines = [];

	const legalmoves = jsutil.deepCopyObject(selection.getLegalMovesOfSelectedPiece());
	const pieceCoords = selection.getPieceSelected().coords;
	const worldSpaceCoords = space.convertCoordToWorldSpace(pieceCoords);

	const color = jsutil.deepCopyObject(options.getLegalMoveHighlightColor());
	color[3] = 1;

	const snapDist = miniimage.gwidthWorld() / 2;
    
	const a = perspective.distToRenderBoard;
	/** @type {BoundingBox} */
	let boundingBox = perspective.getEnabled() ? { left: -a, right: a, bottom: -a, top: a } : camera.getScreenBoundingBox(false);
    
	const mouseLocation = input.getMouseWorldLocation();

	let closestDistance;
	let closestPoint;
	for (const strline in legalmoves.sliding) {
		const line = coordutil.getCoordsFromKey(strline);
		const lineIsVertical = line[0] === 0;

		const intersectionPoints = math.findLineBoxIntersections(worldSpaceCoords, line, boundingBox).map(intersection => intersection.coords);
        
		if (!intersectionPoints[0]) continue;
		const leftLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.sliding[strline], line, false);
		const leftLimitPointWorld = space.convertCoordToWorldSpace(leftLimitPointCoord);
		intersectionPoints[0] = capPointAtSlideLimit(intersectionPoints[0], leftLimitPointWorld, false, lineIsVertical);

		if (!intersectionPoints[1]) continue; // I hate this
		const rightLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, legalmoves.sliding[strline], line, true);
		const rightLimitPointWorld = space.convertCoordToWorldSpace(rightLimitPointCoord);
		intersectionPoints[1] = capPointAtSlideLimit(intersectionPoints[1], rightLimitPointWorld, true, lineIsVertical);

		appendLineToData(dataLines, intersectionPoints[0], intersectionPoints[1], color);
        
		const snapPoint = math.closestPointOnLine(intersectionPoints[0], intersectionPoints[1], mouseLocation);
		if (!closestDistance) { if (snapPoint.distance > snapDist) continue; }
		else if (snapPoint.distance > closestDistance) {continue;}
		closestDistance = snapPoint.distance;
		snapPoint.moveset = legalmoves.sliding[strline];
		snapPoint.line = line;
		closestPoint = snapPoint;
	};
    
	modelLines = createModel(dataLines, 2, "LINES", true);

	// Ghost image...

	if (perspective.getEnabled() && !perspective.isMouseLocked()) return;

	modelGhost = undefined;

	// In the future we'll still need to pass this point if we've got
	// key points that would trump clicking pieces
	if (miniimage.isHovering()) return;

	if (!closestPoint) return; // There were no snapping points, the mouse is not next to a line.
	// Generate the ghost image model

	const dataGhost = [];

	const type = selection.getPieceSelected().type;

	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);

	const halfWidth = miniimage.gwidthWorld() / 2;

	const startX = closestPoint.coords[0] - halfWidth;
	const startY = closestPoint.coords[1] - halfWidth;
	const endX = startX + miniimage.gwidthWorld();
	const endY = startY + miniimage.gwidthWorld();

	const { r, g, b } = options.getColorOfType(type);

	const data = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, r, g, b, opacityOfGhostImage);

	dataGhost.push(...data);
    
	modelGhost = createModel(dataGhost, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
    
	// If we clicked, teleport to the point on the line closest to the click location.
	// BUT we have to recalculate it in coords format instead of world-space

	if (!input.isMouseDown_Left() && !input.getTouchClicked()) return;

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

function appendLineToData(data, point1, point2, color) {

	const [ r, g, b, a ] = color;

	data.push(
		// Vertex               Color
		point1[0], point1[1], r, g, b, a,
		point2[0], point2[1], r, g, b, a
	);
}

function capPointAtSlideLimit(point, slideLimit, positive, lineIsVertical) { // slideLimit = [x,y]
	const cappingAxis = lineIsVertical ? 1 : 0;
	if (!positive && point[cappingAxis] < slideLimit[cappingAxis]
        || positive && point[cappingAxis] > slideLimit[cappingAxis]) return slideLimit;
	return point;
}

function getPointOfDiagSlideLimit(pieceCoords, moveset, line, positive) { // positive is true if it's the right/top
	const steps = positive ? moveset[1] : moveset[0];
	const yDiff = line[1] * steps;
	const xDiff = line[0] * steps;
	return [pieceCoords[0] + xDiff, pieceCoords[1] + yDiff];
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
	genModel,
	render
};