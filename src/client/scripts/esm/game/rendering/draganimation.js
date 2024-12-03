
// Import start
import shapes from "./shapes.js";
import buffermodel from "./buffermodel.js";
import bufferdata from "./bufferdata.js";
import options from "./options.js";
import spritesheet from "./spritesheet.js";
import perspective from "./perspective.js";
import sound from "../misc/sound.js";
import frametracker from "./frametracker.js";
import movement from "./movement.js";
import input from "../input.js";
// Import end

"use strict";

/**
 * This script hides the original piece and renders a copy at the pointer location.
 * It also highlights the square that the piece would be dropped on (to do)
 * and plays the sound when the piece is dropped.
 */

/**
 * To Do:
 * - Emphasise the hovered square like Lichess and Chess.com.
 */

const z = 0.01;
/** When not in perspective the pieces size is independent of board scale. */
const touchscreenScale = 2;
const mouseScale = 1;
/** When using a touchscreen, the piece is shifted upward by this amount to prevent it being covered by fingers. */
const touchscreenOffset = 2;
/**
 * The minimum size of the dragged piece relative to the stationary pieces.
 * When zoomed in, this prevents it becoming tiny relative to the others.
 */
const minimumScale = 0.75;

/** The hight the piece is rendered above the board when in perspective mode. */
const perspectiveHeight = 0.6;
const shadowColor = [0.1, 0.1, 0.1, 0.5];

let startCoords;
let endCoords;
let pieceType;

let transparentModel;
let pieceModel;

function renderTransparentSquare() {
	if(!startCoords) return;
	genTransparentModel();
	transparentModel.render();
}

function renderPiece() {
	if(perspective.isLookingUp() || !endCoords) return;
	genPieceModel();
	pieceModel.render();
}

function genTransparentModel() {
	let color = [0,0,0,0];
	let data = shapes.getTransformedDataQuad_Color3D_FromCoord(startCoords, z, color); //Hide orginal piece
	transparentModel = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
}

function genPieceModel() {
	if(perspective.isLookingUp()) return;
	const perspectiveEnabled = perspective.getEnabled();
	const touchscreen = input.getUsingTouchscreen();
	const boardScale = movement.getBoardScale();
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(pieceType, rotation);
	const { r, g, b, a } = options.getColorOfType(pieceType);
	const height = perspectiveEnabled ? perspectiveHeight * boardScale : z;
	
	let width = perspectiveEnabled ? boardScale : touchscreen ? touchscreenScale : mouseScale;
	const minimumWidth = boardScale * minimumScale;
	if (width < minimumWidth) width = minimumWidth; 
	const left = endCoords[0] - width / 2;
	const bottom = endCoords[1] - width / 2 + (touchscreen ? touchscreenOffset : 0);
	const right = endCoords[0] + width / 2;
	const top = endCoords[1] + width / 2 + (touchscreen ? touchscreenOffset : 0);
	let data = [];
	if (perspectiveEnabled) data.push(...bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop, ...shadowColor));
	data.push(...bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, height, texleft, texbottom, texright, textop, r, g, b, a));
	pieceModel = buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", spritesheet.getSpritesheet());
}

/**
 * 
 * @param {string} type - The type of piece being dragged
 * @param {number} pieceCoords - the square the piece was on
 * @param {number[]} coords - the world coordinates the piece has been dragged to
 */
function dragPiece(type, pieceCoords, coords) {
	startCoords = pieceCoords;
	endCoords = coords;
	pieceType = type;
	frametracker.onVisualChange();
}

function dropPiece( playSound = true, wasCapture = false ) {
	if (playSound) {
		if (wasCapture) sound.playSound_capture(0, false);
		else sound.playSound_move(0, false);
	}
	pieceType = null;
	startCoords = null;
	endCoords = null;
	frametracker.onVisualChange();
}

export default {
	dragPiece,
	dropPiece,
	renderTransparentSquare,
	renderPiece
}