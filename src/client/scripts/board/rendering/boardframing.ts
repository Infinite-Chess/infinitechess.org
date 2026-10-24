// src/client/scripts/board/rendering/boardframing.ts

/**
 * Frames a live game's board: a camera target fitting as many of its pieces as it can within
 * a zoom-out limit, kept current from its moves alone, and the glide that eases the camera there.
 * Each page that frames a board tunes it with its own {@link FramingConfig}.
 */

import type { Area } from './area.js';
import type { MoveFull } from '../../../../shared/chess/logic/movepiece.js';
import type { GameFile } from '../../../../shared/chess/logic/gamefile.js';
import type RenderContext from './RenderContext.js';
import type { BoundingBox } from '../../../../shared/util/math/bounds.js';
import type { Coords, CoordsKey } from '../../../../shared/util/coordutil.js';

import bd from '@naviary/bigdecimal';

import bounds from '../../../../shared/util/math/bounds.js';
import bimath from '../../../../shared/util/math/bimath.js';
import vectors from '../../../../shared/util/math/vectors.js';
import coordutil from '../../../../shared/util/coordutil.js';
import boardutil from '../../../../shared/chess/logic/boardutil.js';

import area from './area.js';
import meshes from './meshes.js';
import deltatime from '../deltatime.js';

// Types -----------------------------------------------------------------------

/** One board's framing: the pieces it may need to fit, and where the camera is headed. */
export interface Framing {
	config: FramingConfig;
	/**
	 * The pieces outside the starting position's box, kept from moves only, never by
	 * scanning the board — positions can hold tens of thousands of pieces.
	 */
	outsiders: Map<CoordsKey, Coords>;
	/** Where the camera is gliding to. */
	target: Area;
}

/** How a page tunes the framing of its boards. */
export interface FramingConfig {
	/** How many times further out than the starting position's view the camera may zoom. */
	maxZoomOut: number;
	/** How long the glide takes to close half its remaining distance, in seconds. */
	glideHalfLifeSecs: number;
	/** How close the glide must get, in world space and in log scale, before snapping onto its target. */
	snapEpsilon: number;
	/** The on-screen size of the board's mini images, in virtual pixels. */
	entityWidthVPixels: number;
}

// Targeting -------------------------------------------------------------------

/** Frames the position on the board, finding its pieces outside the start box from its moves. */
function create(ctx: RenderContext, gamefile: GameFile, config: FramingConfig): Framing {
	const startBox = gamefile.startSnapshot.box;
	const outsiders = new Map<CoordsKey, Coords>();
	for (const move of gamefile.moves) {
		for (const coords of getLandingSquares(move)) {
			if (bounds.boxContainsSquare(startBox, coords)) continue;
			if (boardutil.getPieceFromCoords(gamefile.pieces, coords) === undefined) continue;
			outsiders.set(coordutil.getKeyFromCoords(coords), coords);
		}
	}
	return { config, outsiders, target: calcTarget(ctx, gamefile, config, outsiders) };
}

/** Updates the pieces outside the start box from a move just made, then retargets. */
function onMove(ctx: RenderContext, gamefile: GameFile, framing: Framing, move: MoveFull): void {
	const startBox = gamefile.startSnapshot.box;
	// Removals first: a capture and the move onto its square both touch the same key.
	for (const change of move.changes) {
		if (change.action === 'add') continue;
		framing.outsiders.delete(coordutil.getKeyFromCoords(change.piece.coords));
	}
	for (const coords of getLandingSquares(move)) {
		if (bounds.boxContainsSquare(startBox, coords)) continue;
		framing.outsiders.set(coordutil.getKeyFromCoords(coords), coords);
	}
	retarget(ctx, gamefile, framing);
}

/** Every square a move puts a piece on, by moving it there or adding it. */
function getLandingSquares(move: MoveFull): Coords[] {
	// prettier-ignore
	return move.changes.flatMap((change) =>
		change.action === 'move' ? [change.endCoords]
		: change.action === 'add' ? [change.piece.coords]
		: [],
	);
}

/** Recomputes where the camera is headed. Call when the canvas resizes, as the fit depends on it. */
function retarget(ctx: RenderContext, gamefile: GameFile, framing: Framing): void {
	framing.target = calcTarget(ctx, gamefile, framing.config, framing.outsiders);
}

/**
 * The view always containing the whole starting position, extended to each piece outside it,
 * nearest first, unless including that piece would zoom out past {@link FramingConfig.maxZoomOut}.
 */
function calcTarget(
	ctx: RenderContext,
	gamefile: GameFile,
	config: FramingConfig,
	outsiders: Map<CoordsKey, Coords>,
): Area {
	const startBox = gamefile.startSnapshot.box;
	let target = area.calculateFromStartPosition(ctx.camera, gamefile, config.entityWidthVPixels);
	const minScale = bd.divideFloating(target.scale, bd.fromNumber(config.maxZoomOut));

	let box: BoundingBox = { ...startBox };
	const nearestFirst = [...outsiders.values()].sort((a, b) =>
		bimath.compare(distanceOutside(startBox, a), distanceOutside(startBox, b)),
	);
	for (const coords of nearestFirst) {
		if (bounds.boxContainsSquare(box, coords)) continue; // Already in view
		const extended: BoundingBox = { ...box };
		bounds.expandBoxToContainSquare(extended, coords);
		const floating = meshes.expandTileBoundingBoxToEncompassWholeSquare(extended);
		const candidate = area.calculateFromUnpaddedBox(ctx.camera, floating, config.entityWidthVPixels); // prettier-ignore
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
function glide(ctx: RenderContext, framing: Framing): void {
	const { boardpos } = ctx;
	const position = boardpos.getBoardPos();
	const scale = boardpos.getBoardScale();
	const { coords: targetPos, scale: targetScale } = framing.target;
	const { glideHalfLifeSecs, snapEpsilon } = framing.config;

	const logGap = bd.ln(targetScale) - bd.ln(scale);
	const gapX = bd.subtract(targetPos[0], position[0]);
	const gapY = bd.subtract(targetPos[1], position[1]);
	const worldGap = Math.max(
		bd.toNumber(bd.multiplyFloating(bd.abs(gapX), scale)),
		bd.toNumber(bd.multiplyFloating(bd.abs(gapY), scale)),
	);
	if (logGap === 0 && worldGap === 0) return; // Already there
	if (Math.abs(logGap) < snapEpsilon && worldGap < snapEpsilon) return snap(ctx, framing);

	const progress = 1 - 2 ** (-deltatime.get() / glideHalfLifeSecs);
	const progressBD = bd.fromNumber(progress);
	boardpos.setBoardScale(bd.exp(bd.fromNumber(bd.ln(scale) + logGap * progress)));
	boardpos.setBoardPos([
		bd.add(position[0], bd.multiply(gapX, progressBD)),
		bd.add(position[1], bd.multiply(gapY, progressBD)),
	]);
}

/** Sets the camera exactly onto its target. */
function snap(ctx: RenderContext, framing: Framing): void {
	ctx.boardpos.setBoardPos(framing.target.coords);
	ctx.boardpos.setBoardScale(framing.target.scale);
}

// Exports ---------------------------------------------------------------------

export default {
	// Targeting
	create,
	onMove,
	retarget,
	// Gliding
	glide,
	snap,
};
