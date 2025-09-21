
/**
 * This generates and renders the meshes of each individual piece type in the game.
 */


import type { Coords } from '../../../../../shared/chess/util/coordutil.js';
import type { Piece } from '../../../../../shared/chess/util/boardutil.js';
import type { TypeGroup } from '../../../../../shared/chess/util/typeutil.js';
import type { Board } from '../../../../../shared/chess/logic/gamefile.js';
import type { Vec3 } from '../../../../../shared/util/math/vectors.js';

import { gl } from './webgl.js';
import coordutil from '../../../../../shared/chess/util/coordutil.js';
import typeutil from '../../../../../shared/chess/util/typeutil.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import instancedshapes from './instancedshapes.js';
import miniimage from './miniimage.js';
import frametracker from './frametracker.js';
import preferences from '../../components/header/preferences.js';
import boardpos from './boardpos.js';
import texturecache from '../../chess/rendering/texturecache.js';
import geometry from '../../../../../shared/util/math/geometry.js';
import vectors from '../../../../../shared/util/math/vectors.js';
import bd from '../../../../../shared/util/bigdecimal/bigdecimal.js';
import perspective from './perspective.js';
import meshes from './meshes.js';
import { rawTypes } from '../../../../../shared/chess/util/typeutil.js';
import { AttributeInfoInstanced, BufferModelInstanced, createModel_Instanced, createModel_Instanced_GivenAttribInfo } from './buffermodel.js';

// Type Definitions ---------------------------------------------------------------------------------


/**
 * Piece Mesh Instance Data.
 * HIGH RESOLUTION bigint values.
 * null === undefined placeholder
 */
type InstanceData = (bigint | null)[];

/** Mesh data of a single piece type in mesh.types */
interface MeshData {
	/** Infinite precision BIGINT instance data for performing arithmetic. */
	instanceData: InstanceData,
	/** Buffer model for rendering. (This automatically stores the instanceData32 array going into the gpu) */
	model: BufferModelInstanced
}

/** An object that contains the buffer models to render the pieces in a game. */
interface Mesh {
	/** The amount the mesh data has been linearly shifted to make it closer to the origin, in coordinates `[x,y]`.
	 * This helps require less severe uniform translations upon rendering when traveling massive distances.
	 * The amount it is shifted depends on the nearest `REGEN_RANGE`. */
	offset: Coords,
	/** Whether the position data of each piece mesh is inverted. This will be true if we're viewing black's perspective. */
	inverted: boolean,
	/** An object containing the mesh data for each type of piece in the game. One for every type in `pieces` */
	types: TypeGroup<MeshData>
};

// Variables ----------------------------------------------------------------------------------------


/**
 * A tiny z offset, to prevent the pieces from tearing with highlights while in perspective.
 * 
 * We can't solve that problem by using blending mode ALWAYS because we need animations
 * to be able to mask (block out) the currently-animated piece by rendering a transparent square
 * on the animated piece's destination that is higher in the depth buffer.
 */
const Z: number = 0.001;

/**
 * The interval at which to modify the mesh's linear offset once you travel this distance.
 * 10,000 was arbitrarily chosen because once you reach uniform translations much bigger
 * than that, the rendering of the pieces start to get somewhat gittery.
 */
const REGEN_RANGE = 10_000n;

// /**
//  * The distance of which panning will noticably distort the pieces mesh.
//  * If we ever shift the piece models by more than this, we should regenerate them instead.
//  */
// const DISTANCE_AT_WHICH_MESH_GLITCHES = Number.MAX_SAFE_INTEGER; // ~9 Quadrillion

/** The instance data array stride, per piece. */
const STRIDE_PER_PIECE = 2; // instanceposition: (x,y)

/** The attribute info of each of the piece type models, excluding voids. */
const ATTRIBUTE_INFO: AttributeInfoInstanced = {
	vertexDataAttribInfo: [{ name: 'a_position', numComponents: 2 }, { name: 'a_texturecoord', numComponents: 2 }],
	instanceDataAttribInfo: [{ name: 'a_instanceposition', numComponents: 2 }]
};


// Generating Meshes ------------------------------------------------------------------------


/**
 * Regenerates every single piece mesh in the gamefile.
 * Call when first loading a game.
 * 
 * SLOWEST. Minimize calling.
 */
function regenAll(boardsim: Board, mesh: Mesh | undefined): void {
	if (!mesh) return;
	console.log("Regenerating all piece type meshes.");

	// Update the offset
	mesh.offset = geometry.roundPointToNearestGridpoint(boardpos.getBoardPos(), REGEN_RANGE);
	// Calculate whether the textures should be inverted or not, based on whether we're viewing black's perspective.
	mesh.inverted = perspective.getIsViewingBlackPerspective();

	// For each piece type in the game, generate its mesh
	for (const type of boardsim.existingTypes) { // [43] pawn(white)
		if (typeutil.getRawType(type) === rawTypes.VOID) mesh.types[type] = genVoidModel(boardsim, mesh, type); // Custom mesh generation logic for voids
		else mesh.types[type] = genTypeModel(boardsim, mesh, type); // Normal generation logic for all pieces with a texture
	}

	frametracker.onVisualChange();

	delete boardsim.pieces.newlyRegenerated; // Delete this flag now. It was to let us know the piece models needed to be regen'd.
}

/**
 * MIGHT BE UNUSED, SOON??
 * 
 * Regenerates the single model of the provided type.
 * Call externally after adding more undefined placeholders to a type list.
 * @param boardsim
 * @param mesh
 * @param type - The type of piece to regen the model for (e.g. 'pawnsW')
 */
function regenType(boardsim: Board, mesh: Mesh, type: number): void {
	console.log(`Regenerating mesh of type ${type}.`);

	if (typeutil.getRawType(type) === rawTypes.VOID) mesh.types[type] = genVoidModel(boardsim, mesh, type); // Custom mesh generation logic for voids
	else mesh.types[type] = genTypeModel(boardsim, mesh, type); // Normal generation logic for all pieces with a texture

	frametracker.onVisualChange();
}

/**
 * Generates the mesh data for a specific piece type in the gamefile that has a texture. (not compatible with voids)
 * Must be called whenever we add more undefineds placeholders to the this piece list.
 * 
 * SLOWEST. Minimize calling.
 * @param boardsim
 * @param mesh
 * @param type - The type of piece of which to generate the model for (e.g. "pawnsW")
 */
function genTypeModel(boardsim: Board, mesh: Mesh, type: number): MeshData {
	const vertexData = instancedshapes.getDataTexture(mesh.inverted);
	const instanceData: InstanceData = getInstanceDataForTypeRange(boardsim, mesh, type);

	const tex = texturecache.getTexture(type);
	return {
		instanceData,
		model: createModel_Instanced_GivenAttribInfo(vertexData, castInstanceDataToFloat32(instanceData), ATTRIBUTE_INFO, 'TRIANGLES', 'textureInstanced', tex)
	};
}

/**
 * Generates the model of the voids in the game.
 * Must be called whenever we add more undefineds placeholders to the voids piece list.
 * 
 * SLOWEST. Minimize calling.
 */
function genVoidModel(boardsim: Board, mesh: Mesh, type: number): MeshData {
	// const voidColor = preferences.getTintColorOfType(type); // Black, from the pieceTheme
	const voidColor = gl.getParameter(gl.COLOR_CLEAR_VALUE); // Same color as the sky / void space star field. DOESN'T EVEN MATTER SINCE IT'S A MASK!
	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(voidColor);
	const instanceData: InstanceData = getInstanceDataForTypeRange(boardsim, mesh, type);

	return {
		instanceData,
		model: createModel_Instanced(vertexData, castInstanceDataToFloat32(instanceData), 'TRIANGLES', 'colorInstanced', true)
	};
}

/**
 * Calculates the instance data of a piece list that will go into its mesh constructor.
 * The instance data contains only the offset of each piece instance, with a stride of 2.
 * Thus, this works will all types of pieces, even those without a texture, such as voids.
 */
function getInstanceDataForTypeRange(boardsim: Board, mesh: Mesh, type: number): InstanceData {
	// const range = boardsim.pieces.typeRanges.get(type)!;
	// const instanceData64: Float64Array = new Float64Array((range.end - range.start) * STRIDE_PER_PIECE); // Initialize with all 0's
	const instanceData: InstanceData = []; // Initialize empty

	let currIndex: number = 0;
	boardutil.iteratePiecesInTypeRange_IncludeUndefineds(boardsim.pieces, type, (idx: number, isUndefined: boolean) => {
		if (isUndefined) {
			// Undefined placeholder, this one should not be visible. If we leave it at 0, then there would be a visible void at [0,0]
			instanceData[currIndex] = null;
			instanceData[currIndex + 1] = null;
		} else { // NOT undefined
			const coords = boardutil.getCoordsFromIdx(boardsim.pieces, idx);
			// Apply the piece mesh offset to the coordinates
			instanceData[currIndex] = coords[0] - mesh.offset[0];
			instanceData[currIndex + 1] = coords[1] - mesh.offset[1];
		}
		currIndex += STRIDE_PER_PIECE;
	});

	return instanceData;
}

/**
 * Converts a (bigint | null) array containing into a `Float32Array`.
 * Which should then be used to pass into a buffer model constructor.
 */
function castInstanceDataToFloat32(instanceData: InstanceData): Float32Array {
	// Pre-allocate the Float32Array to the final size. Critical for performance.
	const result: Float32Array = new Float32Array(instanceData.length);

	// Iterate through the source array once and place the converted value directly into the result array.
	// This single-pass approach is much faster than methods like .map(), which create a temporary intermediate array.
	for (let i: number = 0; i < instanceData.length; i++) {
		const value: bigint | null = instanceData[i]!;

		if (value === null) {
			// Convert null to NaN. When used as a vertex position, NaN values are typically
			// discarded by the GPU's rasterizer, effectively making the vertex invisible.
			result[i] = NaN; // Alternative would be Infinity
		} else { // value === bigint
			// Convert the bigint to a number. The Float32Array will store it as a 32-bit float.
			// Naturally, precision loss occurs.
			result[i] = Number(value);
		}
	}

	return result;
}

/**
 * Converts a bigint instance data array into a `Float32Array`.
 * Which should then be used to pass into a buffer model constructor.
 */
function castBigIntArrayToFloat32(instanceData: bigint[]): Float32Array {
	// Pre-allocate the Float32Array to the final size. This is critical for performance.
	const result: Float32Array = new Float32Array(instanceData.length);

	// Iterate through the source array once and place the converted value directly into the result array.
	// This single-pass approach is much faster than methods like .map(), which create a temporary intermediate array.
	for (let i: number = 0; i < instanceData.length; i++) {
		// Convert the bigint to a number. The Float32Array will store it as a 32-bit float.
		// Be aware of potential precision loss for very large BigInts.
		result[i] = Number(instanceData[i]);
	}

	return result;
}


// Shifting Meshes ------------------------------------------------------------------------


/**
 * Shifts the instance data of each piece mesh in the game to require less severe
 * uniform translations upon rendering, and reinits them on the gpu.
 * Faster than {@link regenAll}.
 */
function shiftAll(boardsim: Board, mesh: Mesh): void {
	console.log("Shifting all piece meshes.");

	const newOffset = geometry.roundPointToNearestGridpoint(boardpos.getBoardPos(), REGEN_RANGE);

	const diffXOffset = mesh.offset[0] - newOffset[0];
	const diffYOffset = mesh.offset[1] - newOffset[1];
	
	// const chebyshevDistance = vectors.chebyshevDistance(mesh.offset, newOffset);
	// if (chebyshevDistance > DISTANCE_AT_WHICH_MESH_GLITCHES) {
	// 	console.log(`REGENERATING the piece models instead of shifting them. They were shifted by ${chebyshevDistance} tiles!`);
	// 	regenAll(boardsim, mesh);
	// 	return;
	// }

	mesh.offset = newOffset;

	// Go ahead and shift each model
	for (const meshData of Object.values(mesh.types)) {
		shiftModel(meshData, diffXOffset, diffYOffset);
	}
}

/**
 * Shifts the vertex data of the piece model and reinits it on the gpu.
 * Faster than {@link regenType} or {@link genTypeModel}.
 * @param meshData - An object containing the infinite resolution bigint instanceData, and the actual model.
 * @param diffXOffset - The x-amount to shift the model's vertex data.
 * @param diffYOffset - The y-amount to shift the model's vertex data.
 */
function shiftModel(meshData: MeshData, diffXOffset: bigint, diffYOffset: bigint): void {

	const instanceData = meshData.instanceData; // High precision floats for performing calculations
	const instanceData32 = meshData.model.instanceData; // Low precision floats for sending to the gpu
	for (let i = 0; i < instanceData32.length; i += STRIDE_PER_PIECE) {
		if (instanceData[i] === null) continue; // Skip undefined placeholders
		
		instanceData[i]! += diffXOffset;
		instanceData[i + 1]! += diffYOffset;
		// Copy the float32 values from the bigint array so as to retain the most precision
		instanceData32[i]! = Number(instanceData[i]!);
		instanceData32[i + 1]! = Number(instanceData[i + 1]!);
	}
	
	// Update the buffer on the gpu!
	meshData.model.updateBufferIndices_InstanceBuffer(0, instanceData.length); // Update every index
}


// Rotating Models ------------------------------------------------------------------------------


/**
 * Rotates each piece model (except voids) by updating its vertex data of
 * a single instance with the updated rotation, then reinits them on the gpu.
 * 
 * FAST, as this only needs to modify the vertex data of a single instance per piece type.
 */
function rotateAll(mesh: Mesh, newInverted: boolean): void {
	// console.log("Rotating position data of all type meshes!");

	mesh.inverted = newInverted;
	const newVertexData = instancedshapes.getDataTexture(mesh.inverted);

	for (const [stringType, meshData] of Object.entries(mesh.types)) {
		const rawType = typeutil.getRawType(Number(stringType));
		if (typeutil.SVGLESS_TYPES.has(rawType)) continue; // Skip voids and other non-textured pieces, currently they are symmetrical
		// Not a void, which means its guaranteed to be a piece with a texture...
		const vertexData = meshData.model.vertexData;
		if (vertexData.length !== newVertexData.length) throw Error("New vertex data must be the same length as the existing! Cannot update buffer indices."); // Safety net
		vertexData.set(newVertexData); // Copies the values over without changing the memory location
		meshData.model.updateBufferIndices_VertexBuffer(0, vertexData.length); // Send those changes off to the gpu
	}
}


// Modifying Mesh Data --------------------------------------------------------------------------


/**
 * Overwrites the instance data of the specified piece within its
 * piece type mesh with the new coordinates of the instance.
 * Then sends that change off to the gpu.
 * 
 * FAST, much faster than regenerating the entire mesh
 * whenever a piece moves or something is captured/generated!
 */
function overwritebufferdata(mesh: Mesh, piece: Piece): void {
	const meshData = mesh.types[piece.type]!;

	const i = piece.index * STRIDE_PER_PIECE;

	const offsetCoord = coordutil.subtractCoords(piece.coords, mesh.offset);

	meshData.instanceData[i] = offsetCoord[0];
	meshData.instanceData[i + 1] = offsetCoord[1];
	meshData.model.instanceData[i] = Number(offsetCoord[0]);
	meshData.model.instanceData[i + 1] = Number(offsetCoord[1]);

	// Update the buffer on the gpu!
	meshData.model.updateBufferIndices_InstanceBuffer(i, STRIDE_PER_PIECE); // Update only the indices the piece is at
}

/**
 * Deletes the instance data of the specified piece within its piece type mesh
 * by overwriting it with Infinity's, then sends that change off to the gpu.
 * 
 * FAST, much faster than regenerating the entire mesh
 * whenever a piece moves or something is captured/generated!
 */
function deletebufferdata(mesh: Mesh, piece: Piece): void {
	const meshData = mesh.types[piece.type]!;

	const i = piece.index * STRIDE_PER_PIECE;

	// Unfortunately we can't set them to 0 to hide it, as an actual piece instance would be visible at [0,0]
	meshData.instanceData[i] = null; 
	meshData.instanceData[i + 1] = null;
	meshData.model.instanceData[i] = NaN;
	meshData.model.instanceData[i + 1] = NaN;

	// Update the buffer on the gpu!
	meshData.model.updateBufferIndices_InstanceBuffer(i, STRIDE_PER_PIECE); // Update only the indices the piece was at
}


// Rendering ----------------------------------------------------------------------------------------


/**
 * Renders ever piece type mesh of the game, EXCLUDING voids,
 * translating and scaling them into position.
 */
function renderAll(boardsim: Board, mesh: Mesh | undefined): void {
	if (!mesh) return; // Mesh hasn't been generated yet

	const boardPos = boardpos.getBoardPos();
	const position = meshes.getModelPosition(boardPos, mesh.offset, Z);
	const boardScale = boardpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];

	if (boardpos.areZoomedOut() && !miniimage.isDisabled()) {
		// Only render voids
		// NOT ANYMORE SINCE ADDING STAR FIELD ANIMATION (voids are rendered separately)
		// mesh.types[rawTypes.VOID]?.model.render(position, scale);
		return;
	};

	// We can render everything...

	// Do we need to shift the instance data of the piece models? Are we out of bounds of our REGEN_RANGE?
	if (!boardpos.areZoomedOut() && isOffsetOutOfRangeOfRegenRange(mesh.offset)) shiftAll(boardsim, mesh);

	// Test if the rotation has changed
	const correctInverted = perspective.getIsViewingBlackPerspective();
	if (mesh.inverted !== correctInverted) rotateAll(mesh, correctInverted);


	for (const [typeStr, meshData] of Object.entries(mesh.types)) {
		const type = Number(typeStr);
		if (type === rawTypes.VOID) continue; // Skip voids, they should be rendered separately
		meshData.model.render(position, scale);
	}
}

/** Renders the voids mesh. */
function renderVoids(mesh: Mesh | undefined): void {
	if (!mesh) return; // Mesh hasn't been generated yet
	
	const boardPos = boardpos.getBoardPos();
	const position = meshes.getModelPosition(boardPos, mesh.offset, Z);
	const boardScale = boardpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];

	mesh.types[rawTypes.VOID]?.model.render(position, scale);
}

/**
 * Tests if the board position is atleast REGEN_RANGE-distance away from the current offset.
 * If so, each piece mesh data should be shifted to require less severe uniform translations when rendering.
 */
function isOffsetOutOfRangeOfRegenRange(offset: Coords): boolean { // offset: [x,y]
	const boardPosRounded: Coords = bd.coordsToBigInt(boardpos.getBoardPos());
	const chebyshevDist = vectors.chebyshevDistance(boardPosRounded, offset);
	return chebyshevDist > REGEN_RANGE;
}


// Exports --------------------------------------------------------------------------------------------


export default {
	ATTRIBUTE_INFO,

	regenAll,
	regenType,
	castBigIntArrayToFloat32,
	overwritebufferdata,
	deletebufferdata,
	renderAll,
	renderVoids,
};

export type {
	MeshData,
	Mesh,
};