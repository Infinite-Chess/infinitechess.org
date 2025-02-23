
/**
 * This script handles the rendering of the mini images of our pieces when we're zoomed out
 */


import type { Coords } from '../../chess/util/coordutil.js';
import type { PooledArray } from '../../chess/logic/organizedlines.js';


import space from '../misc/space.js';
import frametracker from './frametracker.js';
import spritesheet from './spritesheet.js';
import gameslot from '../chess/gameslot.js';
import { createModel, BufferModel } from './buffermodel.js';
import animation from './animation.js';
import coordutil from '../../chess/util/coordutil.js';
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
import board from './board.js';


// Variables --------------------------------------------------------------


/** Width of ghost-pieces when zoomed out, in virtual pixels. */
const MINI_IMAGE_WIDTH_VPIXELS: number = 36; // Default: 36
const MINI_IMAGE_OPACITY: number = 0.6;
/** The maximum distance in virtual pixels an animated mini image can travel before teleporting mid-animation near the end of its destination, so it doesn't move too rapidly on-screen. */
const MAX_ANIM_DIST_VPIXELS = 2300;


/** {@link MINI_IMAGE_WIDTH_VPIXELS}, but converted to world-space units. This is recalculated on every screen resize. */
let widthWorld: number;
/** True if currently hovering over a mini image */
let hovering: boolean = false;
/** True if we're disabled and not rendering mini images, such as when there's too many pieces. */
let disabled: boolean = false; // Disabled when there's too many pieces

let model: BufferModel;


// Getters & Setters --------------------------------------------------------------


function getWidthWorld(): number {
	return widthWorld;
}

// Call after screen resize
function recalcWidthWorld(): void {
	// Convert width to world-space
	widthWorld = space.convertPixelsToWorldSpace_Virtual(MINI_IMAGE_WIDTH_VPIXELS);
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


// Updating --------------------------------------------------------------------------


function testIfToggled(): void {
	if (!input.isKeyDown('p')) return;

	// Toggled
	disabled = !disabled;
	frametracker.onVisualChange();

	if (disabled) statustext.showStatus(translations['rendering'].icon_rendering_off);
	else statustext.showStatus(translations['rendering'].icon_rendering_on);
}

/**
 * Generates the buffer model of the miniimages of the pieces when we're zoomed out.
 * This also detects if we click on a mini-image and if so, teleports us there.
 * 
 * This must be done in the game's update() loop, because it listens for mouse events,
 * and can start teleports.
 */
function genModel() {
	if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
	if (disabled) return; // Too many pieces to render icons!

	const gamefile = gameslot.getGamefile()!;

	// Every frame we'll need to regenerate the buffer model
	const data: number[] = [];
	const piecesClicked: Coords[] = [];

	// Iterate through all pieces
	// ...

	const halfWidth: number = widthWorld / 2;
	const boardPos: Coords = movement.getBoardPos();
	const boardScale: number = movement.getBoardScale();

	// While we're iterating, test to see if mouse is hovering over, if so, make opacity 100%
	// We know the board coordinates of the pieces.. what is the world-space coordinates of the mouse? input.getMouseWorldLocation()

	const areWatchingMousePosition: boolean = !perspective.getEnabled() || perspective.isMouseLocked();
	const atleastOneAnimation: boolean = animation.animations.length > 0;

	const rotation: number = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	for (const [key,value] of Object.entries(gamefile.ourPieces)) {
		const pieceType = key as string;
		if (pieceType.startsWith('voids')) continue; // Skip voids
		const thesePieces = value as PooledArray<Coords>;

		const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(pieceType, rotation);
		const { r, g, b } = options.getColorOfType(pieceType);

		thesePieces.forEach(coords => processPiece(coords, texleft, texbottom, texright, textop, r, g, b));
	}

	function processPiece(coords: Coords | undefined, texleft: number, texbottom: number, texright: number, textop: number, r: number,  g: number, b: number) {
		if (!coords) return; // Skip undefined placeholders
		if (atleastOneAnimation && animation.animations.some(a => coordutil.areCoordsEqual_noValidate(coords, a.path[a.path.length - 1]!))) return; // Skip, this piece is being animated.

		const startX: number = (coords[0] - boardPos[0]) * boardScale - halfWidth;
		const startY: number = (coords[1] - boardPos[1]) * boardScale - halfWidth;
		const endX: number = startX + widthWorld;
		const endY: number = startY + widthWorld;

		let thisOpacity: number = MINI_IMAGE_OPACITY;

		// Are we hovering over? If so, opacity needs to be 100%
		if (areWatchingMousePosition) {
			const pointerWorldLocation: Coords = input.getPointerWorldLocation() as Coords;
			const mouseWorldX: number = pointerWorldLocation[0];
			const mouseWorldY: number = pointerWorldLocation[1];

			if (mouseWorldX > startX && mouseWorldX < endX && mouseWorldY > startY && mouseWorldY < endY) {
				thisOpacity = 1;
				hovering = true;
				/**
				 * If we also clicked, then teleport!
				 * Add them to a list of pieces we're hovering over.
				 * If we click, we teleport to a location containing them all.
				 */
				if (input.getPointerClicked()) piecesClicked.push(coords);
				else if (input.getPointerDown()) input.removePointerDown(); // Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
			}
		}

		data.push(...bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, r, g, b, thisOpacity));
	}

	// Add the animated pieces
	animation.animations.forEach(a => {
		// Animate the main piece being animated
		const maxDistB4Teleport = MAX_ANIM_DIST_VPIXELS / board.gtileWidth_Pixels(true); 
		const currentCoords = animation.getCurrentAnimationPosition(a, maxDistB4Teleport);
		let { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(a.type, rotation);
		let { r, g, b } = options.getColorOfType(a.type);
		processPiece(currentCoords, texleft, texbottom, texright, textop, r, g, b);

		// Animate the captured piece too, if there is one
		if (!a.captured) return;
		({ texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(a.type, rotation));
		({ r, g, b } = options.getColorOfType(a.type));
		processPiece(a.captured.coords, texleft, texbottom, texright, textop, r, g, b);
	});

	// Finally, teleport to clicked pieces
	if (piecesClicked.length > 0) {
		const theArea = area.calculateFromCoordsList(piecesClicked);

		const endCoords: Coords = theArea.coords as Coords;
		const endScale: number = theArea.scale;
		const tel = { endCoords, endScale };
		transition.teleport(tel);
	}

	model = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
}


// Rendering ---------------------------------------------------------------


function render(): void {
	hovering = false;
	if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
	if (disabled) return; // Too many pieces to render icons!
	webgl.executeWithDepthFunc_ALWAYS(model.render);
}


// Exports ---------------------------------------------------------------------------------


export default {
	getWidthWorld,
	recalcWidthWorld,
	isHovering,
	isDisabled,
	enable,
	disable,
	testIfToggled,
	genModel,
	render,
};