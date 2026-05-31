// src/client/scripts/esm/game/rendering/arrows/arrowsgraphics.ts

/**
 * This script renders all arrow indicators on the screen edges,
 * including piece indicators (pointing to off-screen pieces)
 * and hint arrows (pointing to off-screen legal move squares).
 */

import type { Color } from '../../../../../../shared/util/math/math.js';
import type { Arrow, ArrowsLine } from './arrows.js';
import type { AttributeInfoInstanced } from '../../../webgl/Renderable.js';

import vectors from '../../../../../../shared/util/math/vectors.js';

import arrows from './arrows.js';
import meshes from '../meshes.js';
import primitives from '../primitives.js';
import preferences from '../../../components/header/preferences.js';
import drawsquares from '../highlights/annotations/drawsquares.js';
import texturecache from '../../../chess/rendering/texturecache.js';
import instancedshapes from '../instancedshapes.js';
import arrowscalculator from './arrowscalculator.js';
import {
	createRenderable_Instanced,
	createRenderable_Instanced_GivenInfo,
} from '../../../webgl/Renderable.js';

// Constants ---------------------------------------------------------------------------

/** The size of arrow triangles as a fraction of the arrow indicator half-width. */
export const ARROW_SIZE_RATIO = 0.3;

/** Attribute layout for the instanced piece-image renderable. */
const ATTRIB_INFO_PICTURES: AttributeInfoInstanced = {
	vertexDataAttribInfo: [
		{ name: 'a_position', numComponents: 2 },
		{ name: 'a_texturecoord', numComponents: 2 },
	],
	instanceDataAttribInfo: [
		{ name: 'a_instanceposition', numComponents: 2 },
		{ name: 'a_instancecolor', numComponents: 4 },
	],
};

/** Attribute layout for the instanced arrow-triangle renderable. */
const ATTRIB_INFO_ARROWS: AttributeInfoInstanced = {
	vertexDataAttribInfo: [{ name: 'a_position', numComponents: 2 }],
	instanceDataAttribInfo: [
		{ name: 'a_instanceposition', numComponents: 2 },
		{ name: 'a_instancecolor', numComponents: 4 },
		{ name: 'a_instancerotation', numComponents: 1 },
	],
};

// Functions ---------------------------------------------------------------------------

/** Renders all the arrow indicators for this frame. */
export function render(): void {
	const slideArrows = arrows.getSlideArrows();
	const animatedArrows = arrows.getAnimatedArrows();
	const hintArrows = arrows.getHintArrows();
	const worldHalfWidth = arrowscalculator.getArrowIndicatorHalfWidth();
	if (
		Object.keys(slideArrows).length === 0 &&
		animatedArrows.length === 0 &&
		hintArrows.length === 0
	)
		return; // No visible arrows, don't generate the model

	// Position data of the single quad instance
	const left = -worldHalfWidth;
	const right = worldHalfWidth;
	const bottom = -worldHalfWidth;
	const top = worldHalfWidth;
	// Texture data of the single quad instance
	const { texleft, texbottom, texright, textop } = meshes.getPieceTexCoords();

	// Initialize the data arrays...

	const vertexData_Pictures: number[] = primitives.Quad_Texture(left, bottom, right, top, texleft, texbottom, texright, textop); // prettier-ignore
	/** Maps each piece type to its list of instance data (position + color per instance). */
	const instanceDataByType = new Map<number, number[]>();

	const vertexData_Arrows: number[] = getVertexDataOfArrow(worldHalfWidth);
	const instanceData_Arrows: number[] = [];

	// Add the data...

	for (const linesOfDirection of Object.values(slideArrows)) {
		for (const line of Object.values(linesOfDirection) as ArrowsLine[]) {
			for (const arrow of line.posDotProd)
				concatData(instanceDataByType, instanceData_Arrows, arrow);
			for (const arrow of line.negDotProd)
				concatData(instanceDataByType, instanceData_Arrows, arrow);
		}
	}
	for (const arrow of animatedArrows) {
		concatData(instanceDataByType, instanceData_Arrows, arrow);
	}

	// Render hint squares first (below piece images)
	if (hintArrows.length > 0) {
		const hintColor = preferences.getLegalMoveHighlightColor({
			isOpponentPiece: false,
			isPremove: false,
		});

		const size = worldHalfWidth * 2;

		// Green squares at screen edge for each hint arrow
		const hintSquaresInstanceData: number[] = hintArrows.flatMap((ha) => ha.worldLocation);
		createRenderable_Instanced(
			instancedshapes.getDataLegalMoveSquare(hintColor),
			hintSquaresInstanceData,
			'TRIANGLES',
			'highlights',
			true,
		).render(undefined, undefined, { u_size: size });

		// Re-render hovered hint squares at increased opacity on top
		const hoveredHintSquaresInstanceData: number[] = hintArrows.filter((ha) => ha.hovered).flatMap((ha) => ha.worldLocation); // prettier-ignore
		if (hoveredHintSquaresInstanceData.length > 0) {
			const hoveredHintColor: Color = [...hintColor];
			hoveredHintColor[3] = drawsquares.HOVER_OPACITY;
			createRenderable_Instanced(
				instancedshapes.getDataLegalMoveSquare(hoveredHintColor),
				hoveredHintSquaresInstanceData,
				'TRIANGLES',
				'highlights',
				true,
			).render(undefined, undefined, { u_size: size });
		}

		// Append hint direction triangles into the shared arrow triangle array
		for (const ha of hintArrows) {
			const dirAsDoubles = vectors.convertVectorToDoubles(ha.direction);
			const angle = Math.atan2(dirAsDoubles[1], dirAsDoubles[0]);
			const a = ha.hovered ? 1 : arrowscalculator.OPACITY;
			instanceData_Arrows.push(...ha.worldLocation, 0, 0, 0, a, angle);
		}
	}

	// Render piece images for regular (piece) arrow indicators, one draw call per type.
	for (const [type, instanceData] of instanceDataByType) {
		createRenderable_Instanced_GivenInfo(
			vertexData_Pictures,
			instanceData,
			ATTRIB_INFO_PICTURES,
			'TRIANGLES',
			'arrowImages',
			[{ texture: texturecache.getTexture(type), uniformName: 'u_sampler' }],
		).render();
	}

	// Render all arrow direction triangles (regular piece arrows + hint arrows) together
	if (instanceData_Arrows.length > 0) {
		createRenderable_Instanced_GivenInfo(
			vertexData_Arrows,
			instanceData_Arrows,
			ATTRIB_INFO_ARROWS,
			'TRIANGLES',
			'arrows',
		).render();
	}
}

/**
 * Takes a piece arrow, appends its picture instance data into the per-type map
 * and (if not stacked) appends its triangle instance data to the arrows array.
 */
function concatData(
	instanceDataByType: Map<number, number[]>,
	instanceData_Arrows: number[],
	arrow: Arrow,
): void {
	/**
	 * Our pictures' instance data needs to contain:
	 *
	 * position offset (2 numbers)
	 * unique color (4 numbers)
	 */

	const a = arrow.hovered ? 1 : arrow.opacity;

	let typeData = instanceDataByType.get(arrow.piece.type);
	if (typeData === undefined) {
		typeData = [];
		instanceDataByType.set(arrow.piece.type, typeData);
	}
	typeData.push(...arrow.worldLocation, 1, 1, 1, a);

	// Next append the data of the little arrow!

	if (arrow.stackIndex > 0) return; // We can skip, since it is a stacked picture! Each stack gets just one arrow.

	/**
	 * Our arrow's instance data needs to contain:
	 *
	 * position offset (2 numbers)
	 * unique color (4 numbers)
	 * rotation offset (1 number)
	 */

	const dirAsDoubles = vectors.convertVectorToDoubles(arrow.direction);
	const angle = Math.atan2(dirAsDoubles[1], dirAsDoubles[0]); // Y value first
	//								position		   color	rotation
	instanceData_Arrows.push(...arrow.worldLocation, 0, 0, 0, a, angle);
}

/**
 * Returns the vertex data of a single arrow instance,
 * for this frame, only containing positional information.
 * @param halfWorldWidth - Half of the width of the arrow indicators for the current frame (dependant on scale).
 */
function getVertexDataOfArrow(halfWorldWidth: number): number[] {
	const size = halfWorldWidth * ARROW_SIZE_RATIO;
	// prettier-ignore
	return [
		halfWorldWidth,       -size,
		halfWorldWidth,        size,
		halfWorldWidth + size, 0,
	];
}

// Exports -----------------------------------------------------------------------------

export default {
	// Frame lifecycle
	render,
};
