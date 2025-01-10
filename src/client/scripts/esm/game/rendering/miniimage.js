
// Import Start
import webgl from './webgl.js';
import input from '../input.js';
import perspective from './perspective.js';
import bufferdata from './bufferdata.js';
import transition from './transition.js';
import movement from './movement.js';
import options from './options.js';
import statustext from '../gui/statustext.js';
import { createModel } from './buffermodel.js';
import area from './area.js';
import typeutil from '../../chess/util/typeutil.js';
import space from '../misc/space.js';
import frametracker from './frametracker.js';
import spritesheet from './spritesheet.js';
import gameslot from '../chess/gameslot.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 */

"use strict";

/** This script handles the rendering of the mini images of our pieces when we're zoomed out
 */

const width = 36; // Default: 36. Width of ghost-pieces when zoomed out, in virtual pixels
let widthWorld;
const opacity = 0.6;

let data = [];
/** The buffer model of the mini piece images when zoomed out.
 * @type {BufferModel} */
let model;

let piecesClicked = [];

let hovering = false; // true if currently hovering over piece

let disabled = false; // Disabled when there's too many pieces


function gwidthWorld() {
	return widthWorld;
}

// Call after screen resize
function recalcWidthWorld() {
	// Convert width to world-space
	widthWorld = space.convertPixelsToWorldSpace_Virtual(width);
}

function gopacity() {
	return opacity;
}

function isHovering() {
	return hovering;
}

function isDisabled() {
	return disabled;
}

function enable() {
	disabled = false;
}

function disable() {
	disabled = true;
}

function testIfToggled() {
	if (!input.isKeyDown('p')) return;

	// Toggled
    
	disabled = !disabled;
	frametracker.onVisualChange();

	if (disabled) statustext.showStatus(translations.rendering.icon_rendering_off);
	else statustext.showStatus(translations.rendering.icon_rendering_on);
}

// Called within update section
// This also detects if we click on a mini-image and if so, teleports us there.
function genModel() {

	hovering = false;
    
	if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
	if (disabled) return; // Too many pieces to render icons!

	// Every frame we'll need to regenerate the buffer model

	data = [];
	piecesClicked = [];

	// Iterate through all pieces
	// ...

	const halfWidth = widthWorld / 2;
	const boardPos = movement.getBoardPos();
	const boardScale = movement.getBoardScale();

	// While we're iterating, test to see if mouse is hovering over, if so, make opacity 100%
	// We know the board coordinates of the pieces.. what is the world-space coordinates of the mouse? input.getMouseWorldLocation()

	const areWatchingMousePosition = !perspective.getEnabled() || perspective.isMouseLocked();
	typeutil.forEachPieceType(concatBufferData, { ignoreVoids: true });

	// Adds pieces of that type's buffer to the overall data
	function concatBufferData(pieceType) {
		const thesePieces = gameslot.getGamefile().ourPieces[pieceType];

		if (!thesePieces) return; // Don't concat data if there are no pieces of this type

		const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
		const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(pieceType, rotation);

		const { r, g, b } = options.getColorOfType(pieceType);

		for (let i = 0; i < thesePieces.length; i++) {
			const thisPiece = thesePieces[i];

			// Piece is undefined, skip! We have undefineds so others can retain their index.
			if (!thisPiece) continue;

			const startX = (thisPiece[0] - boardPos[0]) * boardScale - halfWidth;
			const startY = (thisPiece[1] - boardPos[1]) * boardScale - halfWidth;
			const endX = startX + widthWorld;
			const endY = startY + widthWorld;

			let thisOpacity = opacity;

			// Are we hovering over? If so, opacity needs to be 100%
			if (areWatchingMousePosition) {
				const touchClicked = input.getTouchClicked();
				const mouseWorldLocation = touchClicked ? input.getTouchClickedWorld() : input.getMouseWorldLocation();
				const mouseWorldX = mouseWorldLocation[0];
				const mouseWorldY = mouseWorldLocation[1];
	
				if (mouseWorldX > startX && mouseWorldX < endX && mouseWorldY > startY && mouseWorldY < endY) {
					thisOpacity = 1;
					hovering = true;
					// If we also clicked, then teleport!
					if (input.isMouseDown_Left() || input.getTouchClicked()) {
						// Add them to a list of pieces we're hovering over.
						// If we click, we teleport to a location containing them all.
						piecesClicked.push(thisPiece);
					}
				}
			}

			const newData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, r, g, b, thisOpacity);

			data.push(...newData);
		}
	}

	model = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());

	// Teleport to clicked pieces
	if (piecesClicked.length > 0) {
		const theArea = area.calculateFromCoordsList(piecesClicked);

		const endCoords = theArea.coords;
		const endScale = theArea.scale;
		// const endScale = 0.00000000000001;
		const tel = { endCoords, endScale };
		transition.teleport(tel);
		// Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
		if (!input.getTouchClicked()) input.removeMouseDown_Left();
	}
}

function render() {
	if (!movement.isScaleLess1Pixel_Virtual()) return;
	if (disabled) return;

	if (!model) genModel(); // LEAVE THIS HERE or mobile will crash when zooming out

	webgl.executeWithDepthFunc_ALWAYS(() => {
		// render.renderModel(model, undefined, undefined, "TRIANGLES", spritesheet.getSpritesheet())
		model.render();
	});
}

export default {
	gwidthWorld,
	gopacity,
	isHovering,
	isDisabled,
	testIfToggled,
	genModel,
	render,
	enable,
	disable,
	recalcWidthWorld
};