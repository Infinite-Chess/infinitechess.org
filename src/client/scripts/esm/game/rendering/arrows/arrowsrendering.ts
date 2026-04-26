// src/client/scripts/esm/game/rendering/arrows/arrowsrendering.ts

/**
 * This script renders all arrow indicators on the screen edges,
 * including piece indicators (pointing to off-screen pieces)
 * and hint arrows (pointing to off-screen legal move squares).
 */

import type { Color } from '../../../../../../shared/util/math/math.js';
import type { AttributeInfoInstanced } from '../../../webgl/Renderable.js';
import type { Arrow, SlideArrows, ArrowsLine, HintArrow } from './arrows.js';

import vectors from '../../../../../../shared/util/math/vectors.js';

import primitives from '../primitives.js';
import spritesheet from '../spritesheet.js';
import perspective from '../perspective.js';
import preferences from '../../../components/header/preferences.js';
import drawsquares from '../highlights/annotations/drawsquares.js';
import instancedshapes from '../instancedshapes.js';
import arrowscalculator from './arrowscalculator.js';
import {
	createRenderable_Instanced,
	createRenderable_Instanced_GivenInfo,
} from '../../../webgl/Renderable.js';

// Constants ---------------------------------------------------------------------------

/**
 * Attribute layout for the instanced piece-image renderable (arrow indicators).
 * Defined once here to avoid re-allocating the object every frame.
 */
const ATTRIB_INFO_PICTURES: AttributeInfoInstanced = {
	vertexDataAttribInfo: [
		{ name: 'a_position', numComponents: 2 },
		{ name: 'a_texturecoord', numComponents: 2 },
	],
	instanceDataAttribInfo: [
		{ name: 'a_instanceposition', numComponents: 2 },
		{ name: 'a_instancetexcoord', numComponents: 2 },
		{ name: 'a_instancecolor', numComponents: 4 },
	],
};

/**
 * Attribute layout for the instanced arrow-triangle renderable.
 * Defined once here to avoid re-allocating the object every frame.
 */
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
export function render(
	slideArrows: SlideArrows,
	animatedArrows: Arrow[],
	hintArrows: HintArrow[],
	worldHalfWidth: number,
): void {
	if (
		Object.keys(slideArrows).length === 0 &&
		animatedArrows.length === 0 &&
		hintArrows.length === 0
	)
		return; // No visible arrows, don't generate the model

	// Position data of the single instance
	const left = -worldHalfWidth;
	const right = worldHalfWidth;
	const bottom = -worldHalfWidth;
	const top = worldHalfWidth;
	// Texture data of the single instance
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texright, texbottom, textop } = spritesheet.getTexDataGeneric(rotation);

	// Initialize the data arrays...

	// prettier-ignore
	const vertexData_Pictures: number[] = primitives.Quad_Texture(left, bottom, right, top, texleft, texbottom, texright, textop);
	const instanceData_Pictures: number[] = [];

	const vertexData_Arrows: number[] = getVertexDataOfArrow(worldHalfWidth);
	const instanceData_Arrows: number[] = [];

	// ADD THE DATA...

	for (const linesOfDirection of Object.values(slideArrows)) {
		for (const line of Object.values(linesOfDirection) as ArrowsLine[]) {
			for (const arrow of line.posDotProd)
				concatData(instanceData_Pictures, instanceData_Arrows, arrow);
			for (const arrow of line.negDotProd)
				concatData(instanceData_Pictures, instanceData_Arrows, arrow);
		}
	}
	for (const arrow of animatedArrows) {
		concatData(instanceData_Pictures, instanceData_Arrows, arrow);
	}

	// Render hint squares and triangles first (below piece images)
	if (hintArrows.length > 0) {
		const hintColor = preferences.getLegalMoveHighlightColor({
			isOpponentPiece: false,
			isPremove: false,
		});

		const size = worldHalfWidth * 2;

		// Green squares at screen edge for each hint arrow
		const hintSquaresInstanceData: number[] = [];
		for (const ha of hintArrows) hintSquaresInstanceData.push(...ha.worldLocation);
		createRenderable_Instanced(
			instancedshapes.getDataLegalMoveSquare(hintColor),
			hintSquaresInstanceData,
			'TRIANGLES',
			'highlights',
			true,
		).render(undefined, undefined, { u_size: size });

		// Re-render hovered hint squares at increased opacity on top
		const hoveredHintSquaresInstanceData: number[] = [];
		for (const ha of hintArrows) {
			if (ha.hovered) hoveredHintSquaresInstanceData.push(...ha.worldLocation);
		}
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

	// Render piece images for regular arrow indicators
	if (instanceData_Pictures.length > 0) {
		const texture = spritesheet.getSpritesheet();
		createRenderable_Instanced_GivenInfo(
			vertexData_Pictures,
			instanceData_Pictures,
			ATTRIB_INFO_PICTURES,
			'TRIANGLES',
			'arrowImages',
			[{ texture, uniformName: 'u_sampler' }],
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
 * Takes an arrow, generates the vertex data of both the PICTURE and ARROW,
 * and appends them to their respective vertex data arrays.
 */
function concatData(
	instanceData_Pictures: number[],
	instanceData_Arrows: number[],
	arrow: Arrow,
): void {
	/**
	 * Our pictures' instance data needs to contain:
	 *
	 * position offset (2 numbers)
	 * unique texcoord (2 numbers)
	 * unique color (4 numbers)
	 */

	const thisTexLocation = spritesheet.getSpritesheetDataTexLocation(arrow.piece.type);

	// Color
	const a = arrow.hovered ? 1 : arrow.opacity;

	//							   instaceposition	   instancetexcoord  instancecolor
	instanceData_Pictures.push(...arrow.worldLocation, ...thisTexLocation, 1, 1, 1, a);

	// Next append the data of the little arrow!

	if (arrow.stackIndex > 0) return; // We can skip, since it is an adjacent picture!

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
	const size = halfWorldWidth * 0.3; // Default size of the little arrows
	return [halfWorldWidth, -size, halfWorldWidth, size, halfWorldWidth + size, 0];
}

// Exports -----------------------------------------------------------------------------

export default {
	// Frame lifecycle
	render,
};
