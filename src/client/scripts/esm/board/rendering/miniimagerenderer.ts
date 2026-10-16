// src/client/scripts/esm/board/rendering/miniimagerenderer.ts

/**
 * The core mini image rendering pipeline: which pieces a board shows as mini images, animated
 * ones included, both normally and once it has too many pieces, and rendering pre-built instance
 * data as instanced piece sprites.
 */

import type { Color } from '../../../../../shared/types/color.js';
import type { MoveFull } from '../../../../../shared/chess/logic/movepiece.js';
import type { Animation } from './animation/animation.js';
import type RenderContext from './RenderContext.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';
import type { BDCoords, Coords, CoordsKey } from '../../../../../shared/util/coordutil.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import typeutil from '../../../../../shared/chess/util/typeutil.js';
import bdcoords from '../../../../../shared/util/bdcoords.js';
import coordutil from '../../../../../shared/util/coordutil.js';
import boardutil from '../../../../../shared/chess/logic/boardutil.js';
import piecethemes from '../../../../../shared/chess/util/piecethemes.js';
import { players as p, TypeGroup } from '../../../../../shared/chess/util/typeutil.js';

import space from './space.js';
import animation from './animation/animation.js';
import boardgeometry from './boardgeometry.js';
import instancedshapes from './instancedshapes.js';
import { RenderableInstanced, AttributeInfoInstanced } from '../../webgl/Renderable.js';

// Constants -------------------------------------------------------------------

/**
 * The most pieces a board shows every mini image of. Past it, only its moved pieces keep theirs,
 * plus, on the game page, those annotated or selected.
 */
const MAX_PIECE_COUNT = 40_000;

const MINI_IMAGE_OPACITY: number = 0.6;

/** The maximum distance in virtual pixels an animated mini image travels before teleporting mid-animation. */
const MAX_ANIM_DIST_VPIXELS = bd.fromBigInt(2300n);

const ATTRIB_INFO: AttributeInfoInstanced = {
	vertexDataAttribInfo: [
		{ name: 'a_position', numComponents: 2 },
		{ name: 'a_texturecoord', numComponents: 2 },
		{ name: 'a_color', numComponents: 4 },
	],
	instanceDataAttribInfo: [{ name: 'a_instanceposition', numComponents: 2 }],
};

// Functions -------------------------------------------------------------------

/**
 * Iterates over every piece a board renders as a mini image, animated and static alike,
 * invoking the callback with its board coords and type. Voids are skipped.
 * @param animations - The animations playing on the board. Their pieces are shown mid-flight.
 */
function forEachRenderablePiece(
	ctx: RenderContext,
	boardsim: BoardPreview,
	animations: Animation[],
	callback: (coords: BDCoords, type: number) => void,
): void {
	// Animated pieces
	const activeHides = forEachAnimatedPiece(ctx, animations, callback);

	// Static pieces
	const pieces = boardsim.pieces;
	boardsim.existingTypes.forEach((type: number) => {
		if (piecethemes.SVGLESS_TYPES.has(typeutil.getRawType(type))) return; // Skip voids

		const range = pieces.typeRanges.get(type)!;
		// Skip types with no pieces
		if (boardutil.getPieceCountOfTypeRange(range) === 0) return;

		boardutil.iteratePiecesInTypeRange(pieces, type, (idx) => {
			const coords = boardutil.getCoordsFromIdx(pieces, idx);
			const coordsKey = coordutil.getKeyFromCoords(coords);
			if (activeHides.has(coordsKey)) return; // Skip pieces that are being hidden due to animations
			const coordsBD = bdcoords.fromCoords(coords);
			callback(coordsBD, type);
		});
	});
}

/**
 * Invokes the callback for the pieces of the viewed position's last and next moves, which a board
 * still shows as mini images, beside its animated pieces, once it has too many for the rest.
 * @param moves - The board's moves, viewed at its move index. A static position has none.
 */
function forEachLastAndNextMovePiece(
	boardsim: BoardPreview,
	moves: MoveFull[],
	animations: Animation[],
	callback: (coords: BDCoords, type: number) => void,
): void {
	const { moveIndex } = boardsim.state.local;
	const lastMove = moves[moveIndex];
	if (lastMove) visitPieceAt(boardsim, animations, lastMove.endCoords, callback);
	const nextMove = moves[moveIndex + 1];
	if (nextMove) visitPieceAt(boardsim, animations, nextMove.startCoords, callback);
}

/** Invokes the callback for the piece on a square, unless an animation landing there already shows it. */
function visitPieceAt(
	boardsim: BoardPreview,
	animations: Animation[],
	coords: Coords,
	callback: (coords: BDCoords, type: number) => void,
): void {
	if (animations.some((a) => coordutil.areCoordsEqual(coords, a.path[a.path.length - 1]!)))
		return;
	const piece = boardutil.getPieceFromCoords(boardsim.pieces, coords);
	if (!piece) throw new Error('Could not find a moved piece at its square: ' + coords);
	callback(bdcoords.fromCoords(coords), piece.type);
}

/**
 * Invokes the callback for every piece a board's animations show mid-flight: each moving piece,
 * and the captured pieces still shown. Returns the squares they hide, whose pieces aren't shown.
 */
function forEachAnimatedPiece(
	ctx: RenderContext,
	animations: Animation[],
	callback: (coords: BDCoords, type: number) => void,
): Set<CoordsKey> {
	const maxDistB4Teleport = getMaxAnimationDistance(ctx);
	const activeHides: Set<CoordsKey> = new Set();
	for (const a of animations) {
		const segmentInfo = animation.getCurrentSegment(a, maxDistB4Teleport);
		callback(animation.getCurrentAnimationPosition(a.segments, segmentInfo), a.type);
		animation.forEachActiveKeyframe(a.showKeyframes, segmentInfo.segmentNum, (pieces) =>
			pieces.forEach((p) => callback(bdcoords.fromCoords(p.coords), p.type)),
		);
		animation.forEachActiveKeyframe(a.hideKeyframes, segmentInfo.segmentNum, (pieces) =>
			pieces.map(coordutil.getKeyFromCoords).forEach((c) => activeHides.add(c)),
		);
	}
	return activeHides;
}

/**
 * The farthest, in squares, an animated mini image travels before teleporting mid-animation
 * near the end of its destination, so it doesn't move too rapidly on-screen.
 */
function getMaxAnimationDistance(ctx: RenderContext): BigDecimal {
	const tileWidthPixels = boardgeometry.getTileWidthPixels(
		ctx.camera,
		ctx.boardpos.getBoardScale(),
	);
	return bd.divideFloating(MAX_ANIM_DIST_VPIXELS, tileWidthPixels);
}

/**
 * Builds instance data (world-space positions per type) for every piece a board renders
 * as a mini image, or only its moved pieces once it has too many. No hover.
 * @param ctx - The render context whose board position places the pieces.
 * @param moves - The board's moves, viewed at its move index. A static position has none.
 * @param animations - The animations playing on the board. Their pieces are shown mid-flight.
 */
function buildInstanceData(
	ctx: RenderContext,
	boardsim: BoardPreview,
	moves: MoveFull[],
	animations: Animation[],
): TypeGroup<number[]> {
	const instanceData: TypeGroup<number[]> = {};

	const boardPos = ctx.boardpos.getBoardPos();
	const boardScale = ctx.boardpos.getBoardScale();
	const callback = (coords: BDCoords, type: number): void => {
		const coordsWorld = space.convertCoordToWorldSpace(coords, boardPos, boardScale);
		(instanceData[type] ??= []).push(...coordsWorld);
	};

	if (isOverPieceCap(boardsim)) {
		forEachAnimatedPiece(ctx, animations, callback);
		forEachLastAndNextMovePiece(boardsim, moves, animations, callback);
	} else forEachRenderablePiece(ctx, boardsim, animations, callback);

	return instanceData;
}

/** Whether a board has more than {@link MAX_PIECE_COUNT} pieces. */
function isOverPieceCap(boardsim: BoardPreview): boolean {
	return boardutil.getPieceCountOfGame(boardsim.pieces) > MAX_PIECE_COUNT;
}

/**
 * Renders mini images from pre-built instance data.
 * @param ctx - The render context to draw into.
 * @param existingTypes - All piece types present on the board (used for render sort order).
 * @param instanceData - World-space positions per type, rendered at normal opacity.
 * @param instanceData_hovered - World-space positions per type rendered at full opacity. May be sparse or empty.
 * @param inverted - True when viewing from black's perspective.
 * @param entityWidthVPixels - The on-screen size of each mini image icon, in virtual pixels.
 */
function render(
	ctx: RenderContext,
	existingTypes: number[],
	instanceData: TypeGroup<number[]>,
	instanceData_hovered: TypeGroup<number[]>,
	inverted: boolean,
	entityWidthVPixels: number,
): void {
	const models: TypeGroup<RenderableInstanced> = {};
	const models_hovered: TypeGroup<RenderableInstanced> = {};

	// Create the models
	for (const [typeStr, thisInstanceData] of Object.entries(instanceData)) {
		if (thisInstanceData.length === 0) continue; // No pieces of this type visible

		const color = [1, 1, 1, MINI_IMAGE_OPACITY] as Color;
		const vertexData: number[] = instancedshapes.getDataColoredTexture(color, inverted);

		const type = Number(typeStr);
		const texture: WebGLTexture = ctx.textures.getTexture(type);
		models[type] = ctx.renderable.createRenderable_Instanced_GivenInfo(
			vertexData,
			new Float32Array(thisInstanceData),
			ATTRIB_INFO,
			'TRIANGLES',
			'miniImages',
			[{ texture, uniformName: 'u_sampler' }],
		);

		// Create the hovered model if it's non empty
		const hoveredData = instanceData_hovered[type];
		if (hoveredData !== undefined && hoveredData.length > 0) {
			const color_hovered = [1, 1, 1, 1] as Color;
			const vertexData_hovered = instancedshapes.getDataColoredTexture(
				color_hovered,
				inverted,
			);
			models_hovered[type] = ctx.renderable.createRenderable_Instanced_GivenInfo(
				vertexData_hovered,
				new Float32Array(hoveredData),
				ATTRIB_INFO,
				'TRIANGLES',
				'miniImages',
				[{ texture, uniformName: 'u_sampler' }],
			);
		}
	}

	// Sort descending so lower player-number pieces (and kings) render on top.
	const sortedNeutrals = existingTypes
		.filter((t: number) => typeutil.getColorFromType(t) === p.NEUTRAL)
		.sort((a: number, b: number) => b - a);
	const sortedColors = existingTypes
		.filter((t: number) => typeutil.getColorFromType(t) !== p.NEUTRAL)
		.sort((a: number, b: number) => b - a);

	const u_size = space.convertPixelsToWorldSpace_Virtual(ctx.camera, entityWidthVPixels);

	ctx.executeWithDepthFunc_ALWAYS(() => {
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

// Exports ---------------------------------------------------------------------

export default {
	MAX_PIECE_COUNT,
	forEachRenderablePiece,
	forEachLastAndNextMovePiece,
	forEachAnimatedPiece,
	buildInstanceData,
	isOverPieceCap,
	render,
};
