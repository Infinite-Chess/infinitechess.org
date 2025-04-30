
/**
 * This script handles the rendering of the mini images of our pieces when we're zoomed out
 */


import type { Coords } from '../../chess/util/coordutil.js';


import space from '../misc/space.js';
import frametracker from './frametracker.js';
import gameslot from '../chess/gameslot.js';
import { createModel_Instanced, BufferModelInstanced } from './buffermodel.js';
import animation from './animation.js';
import coordutil from '../../chess/util/coordutil.js';
import { players, TypeGroup } from '../../chess/util/typeutil.js';
import boardutil from '../../chess/util/boardutil.js';
import snapping from './highlights/snapping.js';
import instancedshapes from './instancedshapes.js';
import texturecache from '../../chess/rendering/texturecache.js';
import math, { Color } from '../../util/math.js';
// @ts-ignore
import webgl from './webgl.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import movement from './movement.js';
// @ts-ignore
import statustext from '../gui/statustext.js';
// @ts-ignore
import board from './board.js';
// @ts-ignore
import typeutil from '../../chess/util/typeutil.js';
// @ts-ignore
import guipause from '../gui/guipause.js';


// Variables --------------------------------------------------------------


const MINI_IMAGE_OPACITY: number = 0.6;
/** The maximum distance in virtual pixels an animated mini image can travel before teleporting mid-animation near the end of its destination, so it doesn't move too rapidly on-screen. */
const MAX_ANIM_DIST_VPIXELS = 2300;


/** True if we're disabled and not rendering mini images, such as when there's too many pieces. */
let disabled: boolean = false; // Disabled when there's too many pieces


/** All mini images currently being hovered over, if zoomed out. */
const imagesHovered: Coords[] = [];

/**
 * The instance data of all the mini images, where the keys are the piece type,
 * and the values are arrays of world space coordinates of images of that type.
 */
let instanceData: TypeGroup<number[]> = {};
/**
 * {@link instanceData}, but only for images being hovered over,
 * since those need to be rendered completely opaque.
 */
let instanceData_hovered: TypeGroup<number[]> = {};


// Toggling --------------------------------------------------------------


function isDisabled(): boolean {
	return disabled;
}

function enable(): void {
	disabled = false;
}

function disable(): void {
	disabled = true;
}

function testIfToggled(): void {
	if (!input.isKeyDown('p')) return;

	// Toggled
	disabled = !disabled;
	frametracker.onVisualChange();

	if (disabled) statustext.showStatus(translations['rendering'].icon_rendering_off);
	else statustext.showStatus(translations['rendering'].icon_rendering_on);
}


// Updating --------------------------------------------------------------------------


/**
 * Generates the instance data for the miniimages of the pieces this frame.
 * At the same time, this calculates what images are being hovered over.
 */
function updateImagesHovered() {
	imagesHovered.length = 0;

	instanceData = {};
	instanceData_hovered = {};

	if (guipause.areWePaused() || !movement.isScaleLess1Pixel_Virtual() || disabled) return;

	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.pieces;

	// Iterate through all pieces...

	const halfWorldWidth: number = snapping.getEntityWidthWorld() / 2;

	// While we're iterating, test to see if mouse is hovering over, if so, add the same data to the hovered data.

	const areWatchingMousePosition: boolean = !perspective.getEnabled() || perspective.isMouseLocked();
	const atleastOneAnimation: boolean = animation.animations.length > 0;


	gamefile.existingTypes.forEach((type: number) => {
		if (boardutil.getPieceCountOfTypeRange(pieces.typeRanges.get(type)!) === 0) return; // The type is ALL undefined placeholders
		if (typeutil.SVGLESS_TYPES.includes(typeutil.getRawType(type))) return; // Skip voids

		const thisInstanceData: 		number[] = [];
		const thisInstanceData_hovered: number[] = [];

		boardutil.iteratePiecesInTypeRange(pieces, type, (idx) => {
			const coords = boardutil.getCoordsFromIdx(pieces, idx);
			if (atleastOneAnimation && animation.animations.some(a => coordutil.areCoordsEqual_noValidate(coords, a.path[a.path.length - 1]!))) return; // Skip, this piece is being animated.
			processPiece(coords, thisInstanceData, thisInstanceData_hovered);
		});

		instanceData[type] = thisInstanceData;
		instanceData_hovered[type] = thisInstanceData_hovered;
	});

	function processPiece(coords: Coords, instanceData: number[], instanceData_hovered: number[]) {
		const coordsWorld = space.convertCoordToWorldSpace_IgnoreSquareCenter(coords);
		instanceData.push(...coordsWorld);

		// Are we hovering over? If so, add the same data to instanceData_hovered
		if (areWatchingMousePosition) {
			const mouseWorld: Coords = input.getPointerWorldLocation() as Coords;
			const dist = math.chebyshevDistance(coordsWorld, mouseWorld);
			if (dist < halfWorldWidth) { // Being hovered over!
				imagesHovered.push(coords);
				instanceData_hovered.push(...coordsWorld);
			}
		}
	}

	// Add the animated pieces
	animation.animations.forEach(a => {
		// Animate the main piece being animated
		const maxDistB4Teleport = MAX_ANIM_DIST_VPIXELS / board.gtileWidth_Pixels(); 
		const currentCoords = animation.getCurrentAnimationPosition(a, maxDistB4Teleport);
		processPiece(currentCoords, instanceData[a.type], instanceData_hovered[a.type]);

		// Animate the captured piece too, if there is one
		if (a.captured) processPiece(a.captured.coords, instanceData[a.captured.type], instanceData_hovered[a.captured.type]);
	});
}


// Rendering ---------------------------------------------------------------


function render(): void {
	if (!movement.isScaleLess1Pixel_Virtual() || disabled) return;

	const gamefile = gameslot.getGamefile()!;
	const inverted = perspective.getIsViewingBlackPerspective();

	const models: TypeGroup<BufferModelInstanced> = {};
	const models_hovered: TypeGroup<BufferModelInstanced> = {};

	// Create the models
	for (const [typeStr, thisInstanceData] of Object.entries(instanceData)) {
		const color = [1,1,1, MINI_IMAGE_OPACITY] as Color;
		const vertexData: number[] = instancedshapes.getDataColoredTexture(color, inverted);

		const type = Number(typeStr);
		const tex: WebGLTexture = texturecache.getTexture(type);
		models[type] = createModel_Instanced(vertexData, new Float32Array(thisInstanceData), 'TRIANGLES', true, tex);
		// Create the hovered model if it's non empty
		if (instanceData_hovered[type].length > 0) {
			const color_hovered = [1,1,1, 1] as Color; // Hovered mini images are fully opaque
			const vertexData_hovered: number[] = instancedshapes.getDataColoredTexture(color_hovered, inverted);
			models_hovered[type] = createModel_Instanced(vertexData_hovered, new Float32Array(instanceData_hovered[type]), 'TRIANGLES', true, tex);
		}
	}

	// Sort the types in descending order, so that lower player number pieces are rendered on top, and kings are rendered on top.
	const sortedNeutrals = gamefile.existingTypes.filter((t: number) => typeutil.getColorFromType(t) === players.NEUTRAL).sort((a:number, b:number) => b - a);
	const sortedColors = gamefile.existingTypes.filter((t: number) => typeutil.getColorFromType(t) !== players.NEUTRAL).sort((a:number, b:number) => b - a);

	webgl.executeWithDepthFunc_ALWAYS(() => {
		for (const neut of sortedNeutrals) {
			models[neut]?.render();
			models_hovered[neut]?.render();
		}
		for (const col of sortedColors) {
			models[col]?.render();
			models_hovered[col]?.render();
		}
	});
}


// Exports ---------------------------------------------------------------------------------


export default {
	imagesHovered,
	
	isDisabled,
	enable,
	disable,
	testIfToggled,

	updateImagesHovered,
	render,
};