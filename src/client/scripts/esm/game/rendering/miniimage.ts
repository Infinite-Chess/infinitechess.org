/**
 * This script handles the rendering of the mini images of our pieces when we're zoomed out
 */


import type { Coords } from '../../chess/util/coordutil.js';


import space from '../misc/space.js';
import frametracker from './frametracker.js';
import gameslot from '../chess/gameslot.js';
import { BufferModelInstanced, AttributeInfoInstanced, createModel_Instanced_GivenAttribInfo } from './buffermodel.js';
import animation from './animation.js';
import coordutil from '../../chess/util/coordutil.js';
import { players, TypeGroup } from '../../chess/util/typeutil.js';
import boardutil, { Piece } from '../../chess/util/boardutil.js';
import mouse from '../../util/mouse.js';
import boardpos from './boardpos.js';
import snapping from './highlights/snapping.js';
import instancedshapes from './instancedshapes.js';
import texturecache from '../../chess/rendering/texturecache.js';
import math, { Color } from '../../util/math.js';
import typeutil from '../../chess/util/typeutil.js';
import selection from '../chess/selection.js';
import jsutil from '../../util/jsutil.js';
// @ts-ignore
import webgl from './webgl.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import statustext from '../gui/statustext.js';
// @ts-ignore
import boardtiles from './boardtiles.js';


// Variables --------------------------------------------------------------

/**
 * The maximum numbers of pieces in a game before we disable mini image rendering
 * for all pieces that aren't underneath a square annotation, ray intersection, being animated, or selected, for performance.
 */
const pieceCountToDisableMiniImages = 50_000;

const MINI_IMAGE_OPACITY: number = 0.6;
/** The maximum distance in virtual pixels an animated mini image can travel before teleporting mid-animation near the end of its destination, so it doesn't move too rapidly on-screen. */
const MAX_ANIM_DIST_VPIXELS = 2300;

/** The attribute info for all mini image vertex & attribute data. */
const attribInfo: AttributeInfoInstanced = {
	vertexDataAttribInfo: [
		{ name: 'position', numComponents: 2 },
		{ name: 'texcoord', numComponents: 2 },
		{ name: 'color', numComponents: 4 }
	],
	instanceDataAttribInfo: [
		{ name: 'instanceposition', numComponents: 2 }
	]
};


/** True if we're disabled and not rendering mini images, such as when there's too many pieces. */
let disabled: boolean = false; // Disabled when there's too many pieces




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

function toggle(): void {
	disabled = !disabled;
	frametracker.onVisualChange();

	if (disabled) statustext.showStatus(translations['rendering'].icon_rendering_off);
	else statustext.showStatus(translations['rendering'].icon_rendering_on);
}


// Updating --------------------------------------------------------------------------


/** Iterate over every renderable piece (static and animated) and invoke the callback with its board coords and type. */
// eslint-disable-next-line no-unused-vars
function forEachRenderablePiece(callback: (coords: Coords, type: number) => void) {
	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.boardsim.pieces;

	// Helper to test if a static piece is being animated
	const isAnimatedStatic = (coords: Coords) => animation.animations.some(a => coordutil.areCoordsEqual(coords, a.path[a.path.length - 1]!));

	// Static pieces
	gamefile.boardsim.existingTypes.forEach((type: number) => {
		if (typeutil.SVGLESS_TYPES.includes(typeutil.getRawType(type))) return; // Skip voids

		const range = pieces.typeRanges.get(type)!;
		// Skip types with no pieces
		if (boardutil.getPieceCountOfTypeRange(range) === 0) return;

		boardutil.iteratePiecesInTypeRange(pieces, type, (idx) => {
			const coords = boardutil.getCoordsFromIdx(pieces, idx);
			if (!isAnimatedStatic(coords)) callback(coords, type);
		});
	});

	// Animated pieces
	animation.animations.forEach(a => {
		// Animate the main piece being animated
		const maxDistB4Teleport = MAX_ANIM_DIST_VPIXELS / boardtiles.gtileWidth_Pixels();
		const current = animation.getCurrentAnimationPosition(a, maxDistB4Teleport);
		callback(current, a.type);

		// Animate the captured piece too, if there is one
		if (a.captured) callback(a.captured.coords, a.captured.type);
	});
}

/** Generates the instance data for the miniimages of the pieces this frame. */
function getImageInstanceData(): { instanceData: TypeGroup<number[]>, instanceData_hovered: TypeGroup<number[]> } {
	const instanceData: TypeGroup<number[]> = {};
	const instanceData_hovered: TypeGroup<number[]> = {};

	const pointerWorlds = mouse.getAllPointerWorlds();

	const boardsim = gameslot.getGamefile()!.boardsim;

	const halfWorldWidth: number = snapping.getEntityWidthWorld() / 2;
	const areWatchingMousePosition: boolean = !perspective.getEnabled() || perspective.isMouseLocked();

	// Prepare empty arrays by type
	boardsim.existingTypes.forEach((type: number) => {
		if (typeutil.SVGLESS_TYPES.includes(typeutil.getRawType(type))) return; // Skip voids

		instanceData[type] = [];
		instanceData_hovered[type] = [];
	});

	if (!disabled) { // Enabled => normal behavior
		forEachRenderablePiece(processPiece); // Process each renderable piece
	} else { // Disabled (too many pieces) => Only process pieces on highlights or being animated
		const piecesToRender = getAllPiecesBelowAnnotePoints();
		piecesToRender.forEach(p => processPiece(p.coords, p.type)); // Calculate their instance data
	}

	/** Calculates and appends the instance data of the piece */
	function processPiece(coords: Coords, type: number) {
		const coordsWorld = space.convertCoordToWorldSpace(coords);
		instanceData[type]!.push(...coordsWorld);

		// Are we hovering over? If so, add the same data to instanceData_hovered
		if (areWatchingMousePosition) {
			for (const pointerWorld of pointerWorlds) {
				if (math.chebyshevDistance(coordsWorld, pointerWorld) < halfWorldWidth) instanceData_hovered[type]!.push(...coordsWorld);
			}
		}
	}

	return { instanceData, instanceData_hovered };
}

/** Returns a list of mini image coordinates that are all being hovered over by the provided world coords. */
function getImagesBelowWorld(world: Coords, trackDists: boolean): { images: Coords[], dists?: number[] } {
	const imagesHovered: Coords[] = [];
	const dists: number[] = [];

	const halfWorldWidth: number = snapping.getEntityWidthWorld() / 2;

	if (!disabled) { // Enabled => normal behavior
		// Check static and animated pieces for hover
		forEachRenderablePiece(processPiece);
	} else { // Disabled (too many pieces) => Only process pieces on highlights or being animated
		const piecesToConsider = getAllPiecesBelowAnnotePoints();
		piecesToConsider.forEach(p => processPiece(p.coords)); // Calculate if their underneath the world coords
	}

	function processPiece(coords: Coords) {
		const coordsWorld = space.convertCoordToWorldSpace(coords);
		if (math.chebyshevDistance(coordsWorld, world) < halfWorldWidth) {
			imagesHovered.push(coords);
			// Upgrade the distance to euclidean
			if (trackDists) dists.push(math.euclideanDistance(coordsWorld, world));
		}
	}

	return trackDists ? { images: imagesHovered, dists } : { images: imagesHovered };
}

/**
 * Returns a list of all pieces that should be rendered when mini-images are disabled.
 * This includes pieces below an annotation snap point, the selected piece, all animated pieces,
 * and the pieces involved in the last and next moves.
 */
function getAllPiecesBelowAnnotePoints(): Piece[] {
	/** Running list of all pieces to render. */
	const piecesToRender: Piece[] = [];

	function pushPieceNoDuplicatesOrVoids(piece: Piece) {
		if (typeutil.SVGLESS_TYPES.includes(typeutil.getRawType(piece.type))) return; // Skip voids
		if (!piecesToRender.some(p => coordutil.areCoordsEqual(p.coords, piece.coords))) {
			piecesToRender.push(piece);
		}
	}
	
	const boardsim = gameslot.getGamefile()!.boardsim;
	const pieces = boardsim.pieces;

	// 1. Get pieces on top of highlights (ray starts, intersections, etc.)
	const annotePoints = snapping.getAnnoteSnapPoints(true);
	annotePoints.forEach(ap => {
		const piece = boardutil.getPieceFromCoords(pieces, ap);
		if (!piece) return; // No piece beneath this highlight
		if (animation.animations.some(a => coordutil.areCoordsEqual(piece.coords, a.path[a.path.length - 1]!))) return; // SKIP PIECES that are currently being animated to this location!!! Those are already rendered.
		pushPieceNoDuplicatesOrVoids(piece);
	});

	// 2. Add the selected piece, if any
	const pieceSelected = selection.getPieceSelected();
	if (pieceSelected) {
		pushPieceNoDuplicatesOrVoids(jsutil.deepCopyObject(pieceSelected));
	}

	// 3. Add all currently animated pieces
	animation.animations.forEach(a => {
		// The main piece being animated
		const maxDistB4Teleport = MAX_ANIM_DIST_VPIXELS / boardtiles.gtileWidth_Pixels();
		const currentCoords = animation.getCurrentAnimationPosition(a, maxDistB4Teleport);
		// Animated pieces don't have a real index, but we need to pass a piece object
		pushPieceNoDuplicatesOrVoids({ coords: currentCoords, type: a.type, index: -1 });

		// The captured piece, if there is one
		if (a.captured) pushPieceNoDuplicatesOrVoids(a.captured);
	});

	// 4. Add pieces from the last and next moves

	const moveIndex = boardsim.state.local.moveIndex;
	// Last move's destination piece
	const lastMove = boardsim.moves[moveIndex];
	if (lastMove && !animation.animations.some(a => coordutil.areCoordsEqual(lastMove.endCoords, a.path[a.path.length - 1]!))) { // SKIP PIECES that are currently being animated to this location!!! Those are already rendered.
		const lastMovedPiece = boardutil.getPieceFromCoords(pieces, lastMove.endCoords)!;
		pushPieceNoDuplicatesOrVoids(lastMovedPiece);
	}
	// Next move's starting piece
	const nextMove = boardsim.moves[moveIndex + 1];
	if (nextMove && !animation.animations.some(a => coordutil.areCoordsEqual(nextMove.startCoords, a.path[a.path.length - 1]!))) { // SKIP PIECES that are currently being animated to this location!!! Those are already rendered.
		const nextToMovePiece = boardutil.getPieceFromCoords(pieces, nextMove.startCoords)!;
		pushPieceNoDuplicatesOrVoids(nextToMovePiece);
	}
	
	return piecesToRender;
}


// Rendering ---------------------------------------------------------------


function render(): void {
	if (!boardpos.areZoomedOut()) return;

	const boardsim = gameslot.getGamefile()!.boardsim;
	const inverted = perspective.getIsViewingBlackPerspective();

	const { instanceData, instanceData_hovered } = getImageInstanceData();

	const models: TypeGroup<BufferModelInstanced> = {};
	const models_hovered: TypeGroup<BufferModelInstanced> = {};

	// Create the models
	for (const [typeStr, thisInstanceData] of Object.entries(instanceData)) {
		if (thisInstanceData.length === 0) continue; // No pieces of this type visible

		const color = [1,1,1, MINI_IMAGE_OPACITY] as Color;
		const vertexData: number[] = instancedshapes.getDataColoredTexture(color, inverted);

		const type = Number(typeStr);
		const tex: WebGLTexture = texturecache.getTexture(type);
		models[type] = createModel_Instanced_GivenAttribInfo(vertexData, new Float32Array(thisInstanceData), attribInfo, 'TRIANGLES', tex);
		// Create the hovered model if it's non empty
		if (instanceData_hovered[type]!.length > 0) {
			const color_hovered = [1,1,1, 1] as Color; // Hovered mini images are fully opaque
			const vertexData_hovered: number[] = instancedshapes.getDataColoredTexture(color_hovered, inverted);
			models_hovered[type] = createModel_Instanced_GivenAttribInfo(vertexData_hovered, new Float32Array(instanceData_hovered[type]!), attribInfo, 'TRIANGLES', tex);
		}
	}

	// Sort the types in descending order, so that lower player number pieces are rendered on top, and kings are rendered on top.
	const sortedNeutrals = boardsim.existingTypes.filter((t: number) => typeutil.getColorFromType(t) === players.NEUTRAL).sort((a:number, b:number) => b - a);
	const sortedColors = boardsim.existingTypes.filter((t: number) => typeutil.getColorFromType(t) !== players.NEUTRAL).sort((a:number, b:number) => b - a);

	webgl.executeWithDepthFunc_ALWAYS(() => {
		for (const neut of sortedNeutrals) {
			models[neut]?.render(undefined, undefined, { size: snapping.getEntityWidthWorld() });
			models_hovered[neut]?.render(undefined, undefined, { size: snapping.getEntityWidthWorld() });
		}
		for (const col of sortedColors) {
			models[col]?.render(undefined, undefined, { size: snapping.getEntityWidthWorld() });
			models_hovered[col]?.render(undefined, undefined, { size: snapping.getEntityWidthWorld() });
		}
	});
}


// Exports ---------------------------------------------------------------------------------


export default {
	pieceCountToDisableMiniImages,
	
	isDisabled,
	enable,
	disable,
	toggle,

	getImagesBelowWorld,
	render,
};