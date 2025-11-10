/**
 * This script handles the rendering of the mini images of our pieces when we're zoomed out
 */


import type { BDCoords, Coords, CoordsKey, DoubleCoords } from '../../../../../shared/chess/util/coordutil.js';


// @ts-ignore
import statustext from '../gui/statustext.js';
import webgl from './webgl.js';
import space from '../misc/space.js';
import frametracker from './frametracker.js';
import gameslot from '../chess/gameslot.js';
import animation from './animation.js';
import coordutil from '../../../../../shared/chess/util/coordutil.js';
import mouse from '../../util/mouse.js';
import boardpos from './boardpos.js';
import snapping from './highlights/snapping.js';
import instancedshapes from './instancedshapes.js';
import texturecache from '../../chess/rendering/texturecache.js';
import vectors from '../../../../../shared/util/math/vectors.js';
import typeutil from '../../../../../shared/chess/util/typeutil.js';
import selection from '../chess/selection.js';
import jsutil from '../../../../../shared/util/jsutil.js';
import boardtiles from './boardtiles.js';
import bd from '../../../../../shared/util/bigdecimal/bigdecimal.js';
import perspective from './perspective.js';
import { Color } from '../../../../../shared/util/math/math.js';
import boardutil, { Piece } from '../../../../../shared/chess/util/boardutil.js';
import { players, TypeGroup } from '../../../../../shared/chess/util/typeutil.js';
import { RenderableInstanced, AttributeInfoInstanced, createRenderable_Instanced_GivenInfo } from '../../webgl/Renderable.js';


// Variables --------------------------------------------------------------

/**
 * The maximum numbers of pieces in a game before we disable mini image rendering
 * for all pieces that aren't underneath a square annotation, ray intersection, being animated, or selected, for performance.
 */
const pieceCountToDisableMiniImages = 40_000;

const MINI_IMAGE_OPACITY: number = 0.6;
/** The maximum distance in virtual pixels an animated mini image can travel before teleporting mid-animation near the end of its destination, so it doesn't move too rapidly on-screen. */
const MAX_ANIM_DIST_VPIXELS = bd.FromBigInt(2300n);

/** The attribute info for all mini image vertex & attribute data. */
const attribInfo: AttributeInfoInstanced = {
	vertexDataAttribInfo: [
		{ name: 'a_position', numComponents: 2 },
		{ name: 'a_texturecoord', numComponents: 2 },
		{ name: 'a_color', numComponents: 4 }
	],
	instanceDataAttribInfo: [
		{ name: 'a_instanceposition', numComponents: 2 }
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
function forEachRenderablePiece(callback: (_coords: BDCoords, _type: number) => void): void {
	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.boardsim.pieces;

	// Animated pieces
	const maxDistB4Teleport = bd.divide_floating(MAX_ANIM_DIST_VPIXELS, boardtiles.gtileWidth_Pixels());
	/** Pieces temporarily being hidden via transparent squares on their destination square. */
	const activeHides: Set<CoordsKey> = new Set();
	for (const a of animation.animations) {
		const segmentInfo = animation.getCurrentSegment(a, maxDistB4Teleport);
		const currentAnimationPosition = animation.getCurrentAnimationPosition(a.segments, segmentInfo);
		callback(currentAnimationPosition, a.type);
		animation.forEachActiveKeyframe(a.showKeyframes, segmentInfo.segmentNum, pieces => pieces.forEach(p => {
			const pieceBDCoords = bd.FromCoords(p.coords);
			callback(pieceBDCoords, p.type);
		}));
		// Construct the hidden pieces for below
		animation.forEachActiveKeyframe(a.hideKeyframes, segmentInfo.segmentNum, pieces => pieces.map(coordutil.getKeyFromCoords).forEach(c => activeHides.add(c)));
	}

	// Static pieces
	gamefile.boardsim.existingTypes.forEach((type: number) => {
		if (typeutil.SVGLESS_TYPES.has(typeutil.getRawType(type))) return; // Skip voids

		const range = pieces.typeRanges.get(type)!;
		// Skip types with no pieces
		if (boardutil.getPieceCountOfTypeRange(range) === 0) return;

		boardutil.iteratePiecesInTypeRange(pieces, type, (idx) => {
			const coords = boardutil.getCoordsFromIdx(pieces, idx);
			const coordsKey = coordutil.getKeyFromCoords(coords);
			if (activeHides.has(coordsKey)) return; // Skip pieces that are being hidden due to animations
			const coordsBD = bd.FromCoords(coords);
			callback(coordsBD, type);
		});
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
		if (typeutil.SVGLESS_TYPES.has(typeutil.getRawType(type))) return; // Skip voids

		instanceData[type] = [];
		instanceData_hovered[type] = [];
	});

	if (!disabled) { // Enabled => normal behavior
		forEachRenderablePiece(processPiece); // Process each renderable piece
	} else { // Disabled (too many pieces) => Only process pieces on highlights or being animated
		const piecesToRender = getAllPiecesBelowAnnotePoints();
		piecesToRender.forEach(p => {
			const coordsBD = bd.FromCoords(p.coords);
			processPiece(coordsBD, p.type);
		}); // Calculate their instance data
	}

	/** Calculates and appends the instance data of the piece */
	function processPiece(coords: BDCoords, type: number): void {
		const coordsWorld = space.convertCoordToWorldSpace(coords);
		instanceData[type]!.push(...coordsWorld);

		// Are we hovering over? If so, add the same data to instanceData_hovered
		if (areWatchingMousePosition) {
			for (const pointerWorld of pointerWorlds) {
				if (vectors.chebyshevDistanceDoubles(coordsWorld, pointerWorld) < halfWorldWidth) instanceData_hovered[type]!.push(...coordsWorld);
			}
		}
	}

	return { instanceData, instanceData_hovered };
}

/** Returns a list of mini image coordinates that are all being hovered over by the provided world coords. */
function getImagesBelowWorld(world: DoubleCoords, trackDists: boolean): { images: Coords[], dists?: number[] } {
	const imagesHovered: Coords[] = [];
	const dists: number[] = [];

	const halfWorldWidth: number = snapping.getEntityWidthWorld() / 2;

	if (!disabled) { // Enabled => normal behavior
		// Check static and animated pieces for hover
		forEachRenderablePiece(processPiece);
	} else { // Disabled (too many pieces) => Only process pieces on highlights or being animated
		const piecesToConsider = getAllPiecesBelowAnnotePoints();
		piecesToConsider.forEach(p => {
			const coordsBD = bd.FromCoords(p.coords);
			processPiece(coordsBD);
		}); // Calculate if their underneath the world coords
	}

	function processPiece(coords: BDCoords): void {
		const coordsWorld = space.convertCoordToWorldSpace(coords);
		if (vectors.chebyshevDistanceDoubles(coordsWorld, world) < halfWorldWidth) {
			const integerCoords = bd.coordsToBigInt(coords);
			imagesHovered.push(integerCoords);
			// Upgrade the distance to euclidean
			if (trackDists) dists.push(vectors.euclideanDistanceDoubles(coordsWorld, world));
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

	function pushPieceNoDuplicatesOrVoids(piece: Piece): void {
		if (typeutil.SVGLESS_TYPES.has(typeutil.getRawType(piece.type))) return; // Skip voids
		if (!piecesToRender.some(p => coordutil.areCoordsEqual(p.coords, piece.coords))) {
			piecesToRender.push(piece);
		}
	}
	
	const boardsim = gameslot.getGamefile()!.boardsim;
	const pieces = boardsim.pieces;

	// 1. Process all animations and add pieces relevant to the current move
	const maxDistB4Teleport = bd.divide_floating(MAX_ANIM_DIST_VPIXELS, boardtiles.gtileWidth_Pixels());
	/** Pieces temporarily being hidden via transparent squares on their destination square. */
	const activeHides: Set<CoordsKey> = new Set();
	for (const a of animation.animations) {
		const segmentInfo = animation.getCurrentSegment(a, maxDistB4Teleport);
		const currentAnimationPosition = animation.getCurrentAnimationPosition(a.segments, segmentInfo);
		// Add the main animated piece
		pushPieceNoDuplicatesOrVoids({
			coords: bd.coordsToBigInt(currentAnimationPosition),
			type: a.type,
			index: -1
		});
		// Add the captured pieces being shown
		animation.forEachActiveKeyframe(a.showKeyframes, segmentInfo.segmentNum, pieces => pieces.forEach(pushPieceNoDuplicatesOrVoids));
		// Construct the hidden pieces for below
		animation.forEachActiveKeyframe(a.hideKeyframes, segmentInfo.segmentNum, pieces => pieces.map(coordutil.getKeyFromCoords).forEach(c => activeHides.add(c)));
	}

	// 2. Get pieces on top of highlights (ray starts, intersections, etc.)
	const annotePoints: Coords[] = snapping.getAnnoteSnapPoints(true).map(bd.coordsToBigInt);
	annotePoints.forEach(ap => {
		const piece = boardutil.getPieceFromCoords(pieces, ap);
		if (!piece) return; // No piece beneath this highlight
		const coordsKey = coordutil.getKeyFromCoords(ap);
		if (activeHides.has(coordsKey)) return; // Skip pieces that are being hidden due to animations
		pushPieceNoDuplicatesOrVoids(piece);
	});

	// 3. Add the selected piece, if any
	const pieceSelected = selection.getPieceSelected();
	if (pieceSelected) {
		pushPieceNoDuplicatesOrVoids(jsutil.deepCopyObject(pieceSelected));
	}

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

	const models: TypeGroup<RenderableInstanced> = {};
	const models_hovered: TypeGroup<RenderableInstanced> = {};

	// Create the models
	for (const [typeStr, thisInstanceData] of Object.entries(instanceData)) {
		if (thisInstanceData.length === 0) continue; // No pieces of this type visible

		const color = [1,1,1, MINI_IMAGE_OPACITY] as Color;
		const vertexData: number[] = instancedshapes.getDataColoredTexture(color, inverted);

		const type = Number(typeStr);
		const texture: WebGLTexture = texturecache.getTexture(type);
		models[type] = createRenderable_Instanced_GivenInfo(vertexData, new Float32Array(thisInstanceData), attribInfo, 'TRIANGLES', 'miniImages', [{ texture, uniformName: 'u_sampler' }]);
		// Create the hovered model if it's non empty
		if (instanceData_hovered[type]!.length > 0) {
			const color_hovered = [1,1,1, 1] as Color; // Hovered mini images are fully opaque
			const vertexData_hovered: number[] = instancedshapes.getDataColoredTexture(color_hovered, inverted);
			models_hovered[type] = createRenderable_Instanced_GivenInfo(vertexData_hovered, new Float32Array(instanceData_hovered[type]!), attribInfo, 'TRIANGLES', 'miniImages', [{ texture, uniformName: 'u_sampler' }]);
		}
	}

	// Sort the types in descending order, so that lower player number pieces are rendered on top, and kings are rendered on top.
	const sortedNeutrals = boardsim.existingTypes.filter((t: number) => typeutil.getColorFromType(t) === players.NEUTRAL).sort((a:number, b:number) => b - a);
	const sortedColors = boardsim.existingTypes.filter((t: number) => typeutil.getColorFromType(t) !== players.NEUTRAL).sort((a:number, b:number) => b - a);

	const u_size = snapping.getEntityWidthWorld();

	webgl.executeWithDepthFunc_ALWAYS(() => {
		for (const neut of sortedNeutrals) {
			models[neut]?.render(undefined, undefined, { u_size });
			models_hovered[neut]?.render(undefined, undefined, { u_size });
		}
		for (const col of sortedColors) {
			models[col]?.render(undefined, undefined, { u_size });
			models_hovered[col]?.render(undefined, undefined, { u_size });
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