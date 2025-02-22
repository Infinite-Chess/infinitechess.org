
/**
 * This script handles the rendering of the mini images of our pieces when we're zoomed out
 */


import type { Coords } from '../../chess/util/coordutil.js';


import space from '../misc/space.js';
import frametracker from './frametracker.js';
import spritesheet from './spritesheet.js';
import gameslot from '../chess/gameslot.js';
import { createModel, BufferModel } from './buffermodel.js';
// @ts-ignore
import webgl from './webgl.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import bufferdata from './bufferdata.js';
// @ts-ignore
import transition from './transition.js';
// @ts-ignore
import movement from './movement.js';
// @ts-ignore
import options from './options.js';
// @ts-ignore
import statustext from '../gui/statustext.js';
// @ts-ignore
import area from './area.js';
// @ts-ignore
import typeutil from '../../chess/util/typeutil.js';


// Variables --------------------------------------------------------------


/** Width of ghost-pieces when zoomed out, in virtual pixels. */
const width: number = 36; // Default: 36
/** {@link width}, but converted to world-space units. This is recalculated on every screen resize. */
let widthWorld: number;
const opacity: number = 0.6;

let data: number[];
/** The buffer model of the mini piece images when zoomed out. */
let model: BufferModel;

let piecesClicked: Coords[];

let hovering: boolean = false; // true if currently hovering over piece

let disabled: boolean = false; // Disabled when there's too many pieces


// Getters & Setters --------------------------------------------------------------


function getWidthWorld(): number {
	return widthWorld;
}

// Call after screen resize
function recalcWidthWorld(): void {
	// Convert width to world-space
	widthWorld = space.convertPixelsToWorldSpace_Virtual(width);
}

function isHovering(): boolean {
	return hovering;
}

function isDisabled(): boolean {
	return disabled;
}

function enable(): void {
	disabled = false;
}

function disable(): void {
	disabled = true;
}


// Updating --------------------------------------------------------------


function testIfToggled(): void {
	if (!input.isKeyDown('p')) return;

	// Toggled
	disabled = !disabled;
	frametracker.onVisualChange();

	if (disabled) statustext.showStatus(translations.rendering.icon_rendering_off);
	else statustext.showStatus(translations.rendering.icon_rendering_on);
}


// Rendering ---------------------------------------------------------------


// Called within update section
// This also detects if we click on a mini-image and if so, teleports us there.
function genModel(): void {
	hovering = false;

	if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
	if (disabled) return; // Too many pieces to render icons!

	const gamefile = gameslot.getGamefile()!;

	// Every frame we'll need to regenerate the buffer model
	data = [];
	piecesClicked = [];

	// Iterate through all pieces
	// ...

	const halfWidth: number = widthWorld / 2;
	const boardPos: Coords = movement.getBoardPos();
	const boardScale: number = movement.getBoardScale();

	// While we're iterating, test to see if mouse is hovering over, if so, make opacity 100%
	// We know the board coordinates of the pieces.. what is the world-space coordinates of the mouse? input.getMouseWorldLocation()

	const areWatchingMousePosition: boolean = !perspective.getEnabled() || perspective.isMouseLocked();
	typeutil.forEachPieceType(concatBufferData, { ignoreVoids: true });

	// Adds pieces of that type's buffer to the overall data
	function concatBufferData(pieceType: string): void {
		const thesePieces = gamefile.ourPieces[pieceType];

		if (!thesePieces) return; // Don't concat data if there are no pieces of this type

		const rotation: number = perspective.getIsViewingBlackPerspective() ? -1 : 1;
		const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(pieceType, rotation);

		const { r, g, b } = options.getColorOfType(pieceType);

		for (let i: number = 0; i < thesePieces.length; i++) {
			const thisPiece: Coords = thesePieces[i]!;

			// Piece is undefined, skip! We have undefineds so others can retain their index.
			if (!thisPiece) continue;

			const startX: number = (thisPiece[0] - boardPos[0]) * boardScale - halfWidth;
			const startY: number = (thisPiece[1] - boardPos[1]) * boardScale - halfWidth;
			const endX: number = startX + widthWorld;
			const endY: number = startY + widthWorld;

			let thisOpacity: number = opacity;

			// Are we hovering over? If so, opacity needs to be 100%
			if (areWatchingMousePosition) {
				const touchClicked: boolean = input.getTouchClicked();
				const mouseWorldLocation: Coords = touchClicked ? input.getTouchClickedWorld() : input.getMouseWorldLocation();
				const mouseWorldX: number = mouseWorldLocation[0];
				const mouseWorldY: number = mouseWorldLocation[1];

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

			const newData: number[] = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, r, g, b, thisOpacity);

			data.push(...newData);
		}
	}

	model = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());

	// Teleport to clicked pieces
	if (piecesClicked.length > 0) {
		const theArea = area.calculateFromCoordsList(piecesClicked);

		const endCoords: Coords = theArea.coords as Coords;
		const endScale: number = theArea.scale;
		// const endScale = 0.00000000000001;
		const tel = { endCoords, endScale };
		transition.teleport(tel);
		// Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
		if (!input.getTouchClicked()) input.removeMouseDown_Left();
	}
}

function render(): void {
	if (!movement.isScaleLess1Pixel_Virtual()) return;
	if (disabled) return;

	if (!model) genModel(); // LEAVE THIS HERE or mobile will crash when zooming out

	webgl.executeWithDepthFunc_ALWAYS(model.render);
}


// Exports ---------------------------------------------------------------------------------


export default {
	getWidthWorld,
	isHovering,
	isDisabled,
	testIfToggled,
	genModel,
	render,
	enable,
	disable,
	recalcWidthWorld
};