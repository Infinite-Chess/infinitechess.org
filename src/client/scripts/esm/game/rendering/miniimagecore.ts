// src/client/scripts/esm/game/rendering/miniimagecore.ts

/**
 * The core mini image rendering pipeline.
 * Accepts pre-built instance data and renders instanced piece sprites.
 * Has no dependency on live game state.
 */

import type { Color } from '../../../../../shared/util/math/math.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';

import typeutil from '../../../../../shared/chess/util/typeutil.js';
import bdcoords from '../../../../../shared/chess/util/bdcoords.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import { players as p, TypeGroup } from '../../../../../shared/chess/util/typeutil.js';

import space from '../misc/space.js';
import webgl from './webgl.js';
import texturecache from '../../chess/rendering/texturecache.js';
import instancedshapes from './instancedshapes.js';
import {
	RenderableInstanced,
	AttributeInfoInstanced,
	createRenderable_Instanced_GivenInfo,
} from '../../webgl/Renderable.js';

// Constants ---------------------------------------------------------------

/**
 * The maximum number of pieces in a game before mini image rendering is disabled
 * for all pieces that aren't underneath an annotation, animated, or selected.
 */
const pieceCountToDisableMiniImages = 40_000;

const MINI_IMAGE_OPACITY: number = 0.6;

const attribInfo: AttributeInfoInstanced = {
	vertexDataAttribInfo: [
		{ name: 'a_position', numComponents: 2 },
		{ name: 'a_texturecoord', numComponents: 2 },
		{ name: 'a_color', numComponents: 4 },
	],
	instanceDataAttribInfo: [{ name: 'a_instanceposition', numComponents: 2 }],
};

// Functions ---------------------------------------------------------------

/**
 * Builds instance data (world-space positions per type) for all pieces in a
 * board preview. No animation, no hover — a flat pass over the piece list.
 */
function buildInstanceData(boardsim: BoardPreview): TypeGroup<number[]> {
	const instanceData: TypeGroup<number[]> = {};

	boardsim.existingTypes.forEach((type: number) => {
		if (typeutil.SVGLESS_TYPES.has(typeutil.getRawType(type))) return; // Skip voids
		const range = boardsim.pieces.typeRanges.get(type)!;
		if (boardutil.getPieceCountOfTypeRange(range) === 0) return; // Skip types with no pieces
		instanceData[type] = [];
		boardutil.iteratePiecesInTypeRange(boardsim.pieces, type, (idx) => {
			const coords = boardutil.getCoordsFromIdx(boardsim.pieces, idx);
			const coordsBD = bdcoords.FromCoords(coords);
			const coordsWorld = space.convertCoordToWorldSpace(coordsBD);
			instanceData[type]!.push(...coordsWorld);
		});
	});

	return instanceData;
}

/**
 * Renders mini images from pre-built instance data.
 * @param existingTypes - All piece types present on the board (used for render sort order).
 * @param instanceData - World-space positions per type, rendered at normal opacity.
 * @param instanceData_hovered - World-space positions per type rendered at full opacity. May be sparse or empty.
 * @param inverted - True when viewing from black's perspective.
 * @param entityWidthVPixels - The on-screen size of each mini image icon, in virtual pixels.
 */
function render(
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
		const texture: WebGLTexture = texturecache.getTexture(type);
		models[type] = createRenderable_Instanced_GivenInfo(
			vertexData,
			new Float32Array(thisInstanceData),
			attribInfo,
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
			models_hovered[type] = createRenderable_Instanced_GivenInfo(
				vertexData_hovered,
				new Float32Array(hoveredData),
				attribInfo,
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

	const u_size = space.convertPixelsToWorldSpace_Virtual(entityWidthVPixels);

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

// Exports -----------------------------------------------------------------

export default {
	pieceCountToDisableMiniImages,
	buildInstanceData,
	render,
};
