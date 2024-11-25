import shapes from "./shapes.js";
import buffermodel from "./buffermodel.js";
import bufferdata from "./bufferdata.js";
import options from "./options.js";
import spritesheet from "./spritesheet.js";
import perspective from "./perspective.js";
import animation from "./animation.js";
import sound from "../misc/sound.js";
import frametracker from "./frametracker.js";

const z = 0.01;
const perspectiveHeight = 1;

let startCoords;
let endCoords;
let pieceType;

let transparentModel;
let pieceModel;

let hidden = false;
let touchscreen;

function renderTransparentSquare() {
	if(!startCoords) return;
	genTransparentModel();
	transparentModel.render();
}

function renderPiece() {
	if(hidden || !endCoords) return;
	genPieceModel();
	pieceModel.render();
}

function genTransparentModel() {
	let data = [];
	let color = [0,0,0,0];
	data.push(...shapes.getTransformedDataQuad_Color3D_FromCoord(startCoords, z, color)); //Hide orginal piece
	transparentModel = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
}

function genPieceModel() {
	let data = [];
	const color = options.getColorOfType(pieceType);
	const height = perspective.getEnabled() ? perspectiveHeight : z;
	data.push(...shapes.getDataQuad_ColorTexture3D_FromCoordAndType(endCoords, height, pieceType, color))
	pieceModel = buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", spritesheet.getSpritesheet());
}

/**
 * 
 * @param {string} type - The type of pieces being dragged
 * @param {number[]} coords 
 * @param {boolean} touchscreen renders the piece above the pointer location to prevent it being covered by fingers
 */
function dragPiece(type, pieceCoords, coords, touchscreenMode) {
	startCoords = pieceCoords;
	endCoords = coords;
	pieceType = type;
	touchscreen = touchscreenMode;
	hidden = false;
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

//Used to hide the piece when looking up in perspective.
function hideHeldPiece() {
	hidden = true;
	frametracker.onVisualChange();
}

export default {
	dragPiece,
	dropPiece,
	hideHeldPiece,
	renderTransparentSquare,
	renderPiece
}