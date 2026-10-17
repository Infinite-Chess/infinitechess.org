// src/client/scripts/esm/views/index/featured/featuredframing.ts

/**
 * Frames a featured game's board: a camera target fitting as many of its pieces as it can within
 * a zoom-out limit, kept current from its moves alone, and the glide that eases the camera there.
 */

import type { Area } from '../../../board/rendering/area.js';
import type LiveBoard from '../../../board/rendering/LiveBoard.js';
import type { MoveFull } from '../../../../../../shared/chess/logic/movepiece.js';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { BoundingBox } from '../../../../../../shared/util/math/bounds.js';
import type { Coords, CoordsKey } from '../../../../../../shared/util/coordutil.js';

import bd from '@naviary/bigdecimal';

import bounds from '../../../../../../shared/util/math/bounds.js';
import bimath from '../../../../../../shared/util/math/bimath.js';
import vectors from '../../../../../../shared/util/math/vectors.js';
import coordutil from '../../../../../../shared/util/coordutil.js';
import boardutil from '../../../../../../shared/chess/logic/boardutil.js';

import area from '../../../board/rendering/area.js';
import meshes from '../../../board/rendering/meshes.js';
import deltatime from '../../../board/deltatime.js';
import standaloneboard from '../../../board/rendering/standaloneboard.js';

// Types -----------------------------------------------------------------------

/** One board's framing: the pieces it may need to fit, and where the camera is headed. */
export interface Framing {
	/**
	 * The pieces outside the starting position's box, kept from moves only, never by
	 * scanning the board — positions can hold tens of thousands of pieces.
	 */
	outsiders: Map<CoordsKey, Coords>;
	/** Where the camera is gliding to. */
	target: Area;
}

// Constants -------------------------------------------------------------------

/** How many times further out than the starting position's view the camera may zoom. */
const MAX_ZOOM_OUT = 2.5;
/** How long the glide takes to close half its remaining distance, in seconds. */
const GLIDE_HALF_LIFE_SECS = 0.1;
/** How close the glide must get, in world space and in log scale, before snapping onto its target. */
const SNAP_EPSILON = 1e-3;

// Targeting -------------------------------------------------------------------

/** Frames a freshly loaded game, snapping straight onto its current view. */
function create(board: LiveBoard, gamefile: GameFile): Framing {
	const startBox = gamefile.startSnapshot.box;
	const outsiders = new Map<CoordsKey, Coords>();
	for (const move of gamefile.moves) {
		if (bounds.boxContainsSquare(startBox, move.endCoords)) continue;
		if (boardutil.getPieceFromCoords(gamefile.pieces, move.endCoords) === undefined) continue;
		outsiders.set(coordutil.getKeyFromCoords(move.endCoords), move.endCoords);
	}
	const framing: Framing = { outsiders, target: calcTarget(board, gamefile, outsiders) };
	snap(board, framing);
	return framing;
}

/** Updates the pieces outside the start box from a move just made, then retargets. */
function onMove(board: LiveBoard, gamefile: GameFile, framing: Framing, move: MoveFull): void {
	const startBox = gamefile.startSnapshot.box;
	// Removals first: a capture and the move onto its square both touch the same key.
	for (const change of move.changes) {
		if (change.action === 'add') continue;
		framing.outsiders.delete(coordutil.getKeyFromCoords(change.piece.coords));
	}
	for (const change of move.changes) {
		const coords =
			change.action === 'move' ? change.endCoords
			: change.action === 'add' ? change.piece.coords
			: undefined; // prettier-ignore
		if (coords === undefined || bounds.boxContainsSquare(startBox, coords)) continue;
		framing.outsiders.set(coordutil.getKeyFromCoords(coords), coords);
	}
	retarget(board, gamefile, framing);
}

/** Recomputes where the camera is headed. Call when the canvas resizes, as the fit depends on it. */
function retarget(board: LiveBoard, gamefile: GameFile, framing: Framing): void {
	framing.target = calcTarget(board, gamefile, framing.outsiders);
}

/**
 * The view always containing the whole starting position, extended to each piece outside it,
 * nearest first, unless including that piece would zoom out past {@link MAX_ZOOM_OUT}.
 */
function calcTarget(board: LiveBoard, gamefile: GameFile, outsiders: Map<CoordsKey, Coords>): Area {
	const startBox = gamefile.startSnapshot.box;
	let target = standaloneboard.calcStartArea(board, gamefile);
	const minScale = bd.divideFloating(target.scale, bd.fromNumber(MAX_ZOOM_OUT));

	let box: BoundingBox = { ...startBox };
	const nearestFirst = [...outsiders.values()].sort((a, b) =>
		bimath.compare(distanceOutside(startBox, a), distanceOutside(startBox, b)),
	);
	for (const coords of nearestFirst) {
		if (bounds.boxContainsSquare(box, coords)) continue; // Already in view
		const extended: BoundingBox = { ...box };
		bounds.expandBoxToContainSquare(extended, coords);
		const floating = meshes.expandTileBoundingBoxToEncompassWholeSquare(extended);
		const candidate = area.calculateFromUnpaddedBox(board.camera, floating, standaloneboard.ENTITY_WIDTH_VPIXELS); // prettier-ignore
		if (bd.compare(candidate.scale, minScale) < 0) continue; // Would zoom out too far
		box = extended;
		target = candidate;
	}
	return target;
}

/** The chebyshev distance from a square to the nearest square of a box. */
function distanceOutside(box: BoundingBox, coords: Coords): bigint {
	const nearest: Coords = [
		bimath.clamp(coords[0], box.left, box.right),
		bimath.clamp(coords[1], box.bottom, box.top),
	];
	return vectors.chebyshevDistance(coords, nearest);
}

// Gliding ---------------------------------------------------------------------

/** Eases the camera toward its target, panning and zooming evenly. Call once per frame. */
function glide(board: LiveBoard, framing: Framing): void {
	const { boardpos } = board;
	const position = boardpos.getBoardPos();
	const scale = boardpos.getBoardScale();
	const { coords: targetPos, scale: targetScale } = framing.target;

	const logGap = bd.ln(targetScale) - bd.ln(scale);
	const gapX = bd.subtract(targetPos[0], position[0]);
	const gapY = bd.subtract(targetPos[1], position[1]);
	const worldGap = Math.max(
		bd.toNumber(bd.multiplyFloating(bd.abs(gapX), scale)),
		bd.toNumber(bd.multiplyFloating(bd.abs(gapY), scale)),
	);
	if (logGap === 0 && worldGap === 0) return; // Already there
	if (Math.abs(logGap) < SNAP_EPSILON && worldGap < SNAP_EPSILON) return snap(board, framing);

	const progress = 1 - 2 ** (-deltatime.get() / GLIDE_HALF_LIFE_SECS);
	const progressBD = bd.fromNumber(progress);
	boardpos.setBoardScale(bd.exp(bd.fromNumber(bd.ln(scale) + logGap * progress)));
	boardpos.setBoardPos([
		bd.add(position[0], bd.multiply(gapX, progressBD)),
		bd.add(position[1], bd.multiply(gapY, progressBD)),
	]);
}

/** Sets the camera exactly onto its target. */
function snap(board: LiveBoard, framing: Framing): void {
	board.boardpos.setBoardPos(framing.target.coords);
	board.boardpos.setBoardScale(framing.target.scale);
}

// Exports ---------------------------------------------------------------------

export default {
	// Targeting
	create,
	onMove,
	retarget,
	// Gliding
	glide,
};
