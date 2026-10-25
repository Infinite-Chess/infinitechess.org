// src/client/scripts/board/rendering/meshes.ts

/**
 * This script can generate mesh vertex data for common shapes,
 * given game info such as coordinates, color, and textures.
 *
 * [Model Space] - REQUIRES position and scale transformations when rendering.
 * [World Space] - DOES NOT require positional or scale transformations when rendering.
 */

import type { Vec3 } from '../../../../shared/util/math/vectors.js';
import type { Color } from '../../../../shared/types/color.js';
import type { Camera } from './camera.js';
import type { BoardPos } from './boardpos.js';
import type {
	BoundingBox,
	BoundingBoxBD,
	DoubleBoundingBox,
} from '../../../../shared/util/math/bounds.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import bounds from '../../../../shared/util/math/bounds.js';
import bdcoords from '../../../../shared/util/bdcoords.js';
import coordutil, { BDCoords, Coords, DoubleCoords } from '../../../../shared/util/coordutil.js';

import primitives from './primitives.js';
import boardgeometry from './boardgeometry.js';

// Constants -------------------------------------------------------------------

const ONE = bd.fromBigInt(1n);

// Square Bounds ---------------------------------------------------------------

/**
 * [Model Space] Returns a bounding box of a square.
 * @param coords - Must be within double bounds because it should only be for model vertice data.
 */
function getCoordBoxModel(coords: DoubleCoords): DoubleBoundingBox {
	const squareCenter = boardgeometry.getSquareCenterAsNumber();
	const left = coords[0] - squareCenter;
	const bottom = coords[1] - squareCenter;
	const right = left + 1;
	const top = bottom + 1;
	return { left, right, bottom, top };
}

/**
 * [World Space] Returns a bounding box of a square.
 */
function getCoordBoxWorld(bpos: BoardPos, coords: Coords): DoubleBoundingBox {
	const boardPos = bpos.getBoardPos();
	const boardScale = bpos.getBoardScaleAsNumber();

	const squareCenterScaled = boardgeometry.getSquareCenterAsNumber() * boardScale;

	const coordsBD = bdcoords.fromCoords(coords);

	const relativeCoords: DoubleCoords = bdcoords.coordsToDoubles(
		coordutil.subtractBDCoords(coordsBD, boardPos),
	);

	const scaledCoords: DoubleCoords = [
		relativeCoords[0] * boardScale,
		relativeCoords[1] * boardScale,
	];

	const left = scaledCoords[0] - squareCenterScaled;
	const right = left + boardScale;
	const bottom = scaledCoords[1] - squareCenterScaled;
	const top = bottom + boardScale;

	return { left, right, bottom, top };
}

/**
 * [Model Space] If you have say a bounding box from coordinate [1,1] to [9,9],
 * this will round that outwards from [0.5,0.5] to [9.5,9.5].
 *
 * Expands the edges of the box, which should contain integer squares for values,
 * to encapsulate the whole of the squares on their edges.
 * Turns it into a floating point edge.
 */
function expandTileBoundingBoxToEncompassWholeSquare(boundingBox: BoundingBox): BoundingBoxBD {
	const boxBD = bounds.castBoundingBoxToBigDecimal(boundingBox);
	return expandTileBoundingBoxToEncompassWholeSquareBD(boxBD);
}

/**
 * {@link expandTileBoundingBoxToEncompassWholeSquare}, but use this if you already have a BigDecimal bounding box.
 */
function expandTileBoundingBoxToEncompassWholeSquareBD(boundingBox: BoundingBoxBD): BoundingBoxBD {
	const squareCenter = boardgeometry.getSquareCenter();
	const inverseSquareCenter = bd.subtract(ONE, squareCenter);

	const left = bd.subtract(boundingBox.left, squareCenter);
	const right = bd.add(boundingBox.right, inverseSquareCenter);
	const bottom = bd.subtract(boundingBox.bottom, squareCenter);
	const top = bd.add(boundingBox.top, inverseSquareCenter);

	return { left, bottom, right, top };
}

/**
 * [World Space] Applies our board position and scale transformations to a floating bounding box
 * so it can be rendered exactly where it is without requiring uniform translations.
 *
 * Since its floating, we don't bother to subtract squareCenter.
 */
function applyWorldTransformationsToBoundingBox(
	bpos: BoardPos,
	boundingBox: BoundingBoxBD,
): DoubleBoundingBox {
	const boardPos = bpos.getBoardPos();
	const boardScale = bpos.getBoardScaleAsNumber();

	const left: number = bd.toNumber(bd.subtract(boundingBox.left, boardPos[0])) * boardScale;
	const right: number = bd.toNumber(bd.subtract(boundingBox.right, boardPos[0])) * boardScale;
	const bottom: number = bd.toNumber(bd.subtract(boundingBox.bottom, boardPos[1])) * boardScale;
	const top: number = bd.toNumber(bd.subtract(boundingBox.top, boardPos[1])) * boardScale;

	return { left, bottom, right, top };
}

// Mesh Data -------------------------------------------------------------------

/**
 * [Model Space] Generates the vertex data of a square highlight, given the coords and color.
 */
function QuadModel_Color(coords: DoubleCoords, color: Color): number[] {
	const { left, bottom, right, top } = getCoordBoxModel(coords);
	return primitives.Quad_Color(left, bottom, right, top, color);
}

/**
 * [World Space] Generates the vertex data of a square highlight, given the coords and color.
 */
function QuadWorld_Color(bpos: BoardPos, coords: Coords, color: Color): number[] {
	const { left, bottom, right, top } = getCoordBoxWorld(bpos, coords);
	return primitives.Quad_Color(left, bottom, right, top, color);
}

/**
 * [World Space] Generates the vertex data of a colored texture.
 */
function QuadWorld_ColorTexture(
	cam: Camera,
	bpos: BoardPos,
	coords: Coords,
	color: Color,
): number[] {
	const { texleft, texbottom, texright, textop } = getPieceTexCoords(cam);
	const { left, right, bottom, top } = getCoordBoxWorld(bpos, coords);
	const [r, g, b, a] = color;

	// prettier-ignore
	return primitives.Quad_ColorTexture(left, bottom, right, top, texleft, texbottom, texright, textop, r, g, b, a);
}

/**
 * Returns the texture coordinates for a full-texture piece quad (UV range 0–1),
 * flipped when viewing from black's perspective.
 */
function getPieceTexCoords(cam: Camera): {
	texleft: number;
	texbottom: number;
	texright: number;
	textop: number;
} {
	const isBlack = cam.getIsViewingBlackPerspective();
	return {
		texleft: isBlack ? 1 : 0,
		texbottom: isBlack ? 1 : 0,
		texright: isBlack ? 0 : 1,
		textop: isBlack ? 0 : 1,
	};
}

/**
 * [World Space, LINE_LOOP] Generates the vertex data of a rectangle outline.
 */
function RectWorld(bpos: BoardPos, boundingBox: BoundingBox, color: Color): number[] {
	const boundingBoxBD = expandTileBoundingBoxToEncompassWholeSquare(boundingBox);
	const { left, right, bottom, top } = applyWorldTransformationsToBoundingBox(
		bpos,
		boundingBoxBD,
	);
	return primitives.Rect(left, bottom, right, top, color);
}

// Other Generic Rendering Methods ---------------------------------------------

/** Returns the position and uniform scale needed to render a board-space model. */
function getBoardRenderTransform(
	bpos: BoardPos,
	offset: Coords,
	z: number = 0,
): { position: Vec3; scale: Vec3 } {
	const boardPos = bpos.getBoardPos();
	const position = getModelPosition(boardPos, offset, z);
	const boardScale = bpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];
	return { position, scale };
}

/**
 * Returns a model's transformed position that should be used when rendering its buffer model.
 *
 * Any model that has a bigint offset, should be able to subtract that offset
 * from our board position to obtain a number small enough for the gpu to render.
 *
 * Typically this will always include numbers smaller than 10,000
 */
function getModelPosition(boardPos: BDCoords, modelOffset: Coords, z: number = 0): Vec3 {
	function getAxis(position: BigDecimal, offset: bigint): number {
		const offsetBD = bd.fromBigInt(offset);
		return bd.toNumber(bd.subtract(offsetBD, position));
	}

	return [
		// offset - boardPos
		getAxis(boardPos[0], modelOffset[0]),
		getAxis(boardPos[1], modelOffset[1]),
		z,
	];
}

// Exports ---------------------------------------------------------------------

export default {
	// Square Bounds
	getCoordBoxModel,
	getCoordBoxWorld,
	expandTileBoundingBoxToEncompassWholeSquare,
	expandTileBoundingBoxToEncompassWholeSquareBD,
	applyWorldTransformationsToBoundingBox,
	// Mesh Data
	QuadModel_Color,
	QuadWorld_Color,
	QuadWorld_ColorTexture,
	getPieceTexCoords,
	RectWorld,
	// Other Generic Rendering Methods
	getBoardRenderTransform,
};
