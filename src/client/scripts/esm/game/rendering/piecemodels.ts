
/**
 * This generates and renders the meshes of each individual piece type in the game.
 */


import type { Coords } from '../../chess/util/coordutil.js';
import type { Piece } from '../../chess/util/boardutil.js';
import type { TypeGroup } from '../../chess/util/typeutil.js';
// @ts-ignore
import type { gamefile } from '../../chess/logic/gamefile.js';

import { AttributeInfoInstanced, BufferModelInstanced, createModel_Instanced, createModel_Instanced_GivenAttribInfo } from './buffermodel.js';
import coordutil from '../../chess/util/coordutil.js';
import typeutil from '../../chess/util/typeutil.js';
import boardutil from '../../chess/util/boardutil.js';
import instancedshapes from './instancedshapes.js';
import math from '../../util/math.js';
import miniimage from './miniimage.js';
import frametracker from './frametracker.js';
import preferences from '../../components/header/preferences.js';
import { rawTypes } from '../../chess/util/typeutil.js';
import boardpos from './boardpos.js';
import texturecache from '../../chess/rendering/texturecache.js';
// @ts-ignore
import perspective from './perspective.js';

// Type Definitions ---------------------------------------------------------------------------------


/** Mesh data of a single piece type in mesh.types */
interface MeshData {
	/** High precision instance data for performing arithmetic. */
	instanceData64: Float64Array,
	/** Buffere model for rendering. (This automatically stores the instanceData32 array going into the gpu) */
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
const REGEN_RANGE = 10_000;

/**
 * The distance of which panning will noticably distort the pieces mesh.
 * If we ever shift the piece models by more than this, we should regenerate them instead.
 */
const DISTANCE_AT_WHICH_MESH_GLITCHES = Number.MAX_SAFE_INTEGER; // ~9 Quadrillion

/** The instance data array stride, per piece. */
const STRIDE_PER_PIECE = 2; // instanceposition: (x,y)

/** The attribute info of each of the piece type models, excluding voids. */
const ATTRIBUTE_INFO: AttributeInfoInstanced = {
	vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }, { name: 'texcoord', numComponents: 2 }],
	instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }]
};


// Generating Meshes ------------------------------------------------------------------------


/**
 * Regenerates every single piece mesh in the gamefile.
 * Call when first loading a game.
 * 
 * SLOWEST. Minimize calling.
 */
function regenAll(gamefile: gamefile, mesh: Mesh) {
	console.log("Regenerating all piece type meshes.");

	// Update the offset
	mesh.offset = math.roundPointToNearestGridpoint(boardpos.getBoardPos(), REGEN_RANGE);
	// Calculate whether the textures should be inverted or not, based on whether we're viewing black's perspective.
	mesh.inverted = perspective.getIsViewingBlackPerspective();

	// For each piece type in the game, generate its mesh
	for (const type of gamefile.existingTypes) { // [43] pawn(white)
		if (typeutil.getRawType(type) === rawTypes.VOID) mesh.types[type] = genVoidModel(gamefile, mesh, type); // Custom mesh generation logic for voids
		else mesh.types[type] = genTypeModel(gamefile, mesh, type); // Normal generation logic for all pieces with a texture
	}

	frametracker.onVisualChange();

	delete gamefile.pieces.newlyRegenerated; // Delete this flag now. It was to let us know the piece models needed to be regen'd.
}

/**
 * MIGHT BE UNUSED, SOON??
 * 
 * Regenerates the single model of the provided type.
 * Call externally after adding more undefined placeholders to a type list.
 * @param gamefile
 * @param type - The type of piece to regen the model for (e.g. 'pawnsW')
 */
function regenType(gamefile: gamefile, mesh: Mesh, type: number) {
	console.log(`Regenerating mesh of type ${type}.`);

	if (typeutil.getRawType(type) === rawTypes.VOID) mesh.types[type] = genVoidModel(gamefile, mesh, type); // Custom mesh generation logic for voids
	else mesh.types[type] = genTypeModel(gamefile, mesh, type); // Normal generation logic for all pieces with a texture

	frametracker.onVisualChange();
}

/**
 * Generates the mesh data for a specific piece type in the gamefile that has a texture. (not compatible with voids)
 * Must be called whenever we add more undefineds placeholders to the this piece list.
 * 
 * SLOWEST. Minimize calling.
 * @param gamefile
 * @param type - The type of piece of which to generate the model for (e.g. "pawnsW")
 */
function genTypeModel(gamefile: gamefile, mesh: Mesh, type: number): MeshData {
	// const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(VOID_COLOR); // VOIDS
	const vertexData = instancedshapes.getDataTexture(mesh.inverted);
	const instanceData64: Float64Array = getInstanceDataForTypeRange(gamefile, mesh, type);

	const tex = texturecache.getTexture(type);
	return {
		instanceData64,
		model: createModel_Instanced_GivenAttribInfo(vertexData, new Float32Array(instanceData64), ATTRIBUTE_INFO, 'TRIANGLES', tex)
	};
}

/**
 * Generates the model of the voids in the game.
 * Must be called whenever we add more undefineds placeholders to the voids piece list.
 * 
 * SLOWEST. Minimize calling.
 */
function genVoidModel(gamefile: gamefile, mesh: Mesh, type: number): MeshData {
	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(preferences.getTintColorOfType(type));
	const instanceData64: Float64Array = getInstanceDataForTypeRange(gamefile, mesh, type);

	return {
		instanceData64,
		model: createModel_Instanced(vertexData, new Float32Array(instanceData64), 'TRIANGLES', true)
	};
}

/**
 * Calculates the instance data of a piece list that will go into its mesh constructor.
 * The instance data contains only the offset of each piece instance, with a stride of 2.
 * Thus, this works will all types of pieces, even those without a texture, such as voids.
 */
function getInstanceDataForTypeRange(gamefile: gamefile, mesh: Mesh, type: number): Float64Array {
	const range = gamefile.pieces.typeRanges.get(type)!;
	const instanceData64: Float64Array = new Float64Array((range.end - range.start) * STRIDE_PER_PIECE); // Initialize with all 0's

	let currIndex: number = 0;
	boardutil.iteratePiecesInTypeRange_IncludeUndefineds(gamefile.pieces, type, (idx: number, isUndefined: boolean) => {
		if (isUndefined) {
			// Undefined placeholder, this one should not be visible. If we leave it at 0, then there would be a visible void at [0,0]
			instanceData64[currIndex] = Infinity;
			instanceData64[currIndex + 1] = Infinity;
		} else { // NOT undefined
			const coords = boardutil.getCoordsFromIdx(gamefile.pieces, idx);
			// Apply the piece mesh offset to the coordinates
			instanceData64[currIndex] = coords[0] - mesh.offset[0];
			instanceData64[currIndex + 1] = coords[1] - mesh.offset[1];
		}
		currIndex += STRIDE_PER_PIECE;
	});

	return instanceData64;
}


// Shifting Meshes ------------------------------------------------------------------------


/**
 * Shifts the instance data of each piece mesh in the game to require less severe
 * uniform translations upon rendering, and reinits them on the gpu.
 * Faster than {@link regenAll}.
 */
function shiftAll(gamefile: gamefile, mesh: Mesh) {
	console.log("Shifting all piece meshes.");

	const newOffset = math.roundPointToNearestGridpoint(boardpos.getBoardPos(), REGEN_RANGE);

	const diffXOffset = mesh.offset[0] - newOffset[0];
	const diffYOffset = mesh.offset[1] - newOffset[1];
	
	const chebyshevDistance = math.chebyshevDistance(mesh.offset, newOffset);
	if (chebyshevDistance > DISTANCE_AT_WHICH_MESH_GLITCHES) {
		console.log(`REGENERATING the piece models instead of shifting them. They were shifted by ${chebyshevDistance} tiles!`);
		regenAll(gamefile, mesh);
		return;
	}

	mesh.offset = newOffset;

	// Go ahead and shift each model
	for (const meshData of Object.values(mesh.types)) {
		shiftModel(meshData as MeshData, diffXOffset, diffYOffset);
	}
}

/**
 * Shifts the vertex data of the piece model and reinits it on the gpu.
 * Faster than {@link regenType} or {@link genTypeModel}.
 * @param meshData - An object containing the instanceData64, and the actual model.
 * @param diffXOffset - The x-amount to shift the model's vertex data.
 * @param diffYOffset - The y-amount to shift the model's vertex data.
 */
function shiftModel(meshData: MeshData, diffXOffset: number, diffYOffset: number): void {

	const instanceData64 = meshData.instanceData64; // High precision floats for performing calculations
	const instanceData32 = meshData.model.instanceData; // Low precision floats for sending to the gpu
	for (let i = 0; i < instanceData32.length; i += STRIDE_PER_PIECE) {
		instanceData64[i]! += diffXOffset;
		instanceData64[i + 1]! += diffYOffset;
		// Copy the float32 values from the float64 array so as to gain the most precision
		instanceData32[i]! = instanceData64[i]!;
		instanceData32[i + 1]! = instanceData64[i + 1]!;
	}
	
	// Update the buffer on the gpu!
	meshData.model.updateBufferIndices_InstanceBuffer(0, instanceData64.length); // Update every index
}


// Rotating Models ------------------------------------------------------------------------------


/**
 * Rotates each piece model (except voids) by updating its vertex data of
 * a single instance with the updated rotation, then reinits them on the gpu.
 * 
 * FAST, as this only needs to modify the vertex data of a single instance per piece type.
 */
function rotateAll(mesh: Mesh, newInverted: boolean) {
	// console.log("Rotating position data of all type meshes!");

	mesh.inverted = newInverted;
	const newVertexData = instancedshapes.getDataTexture(mesh.inverted);

	for (const [stringType, meshData] of Object.entries(mesh.types)) {
		const rawType = typeutil.getRawType(Number(stringType));
		if (typeutil.SVGLESS_TYPES.some(t => t === rawType)) continue; // Skip voids and other non-textured pieces, currently they are symmetrical
		// Not a void, which means its guaranteed to be a piece with a texture...
		const vertexData = (meshData as MeshData).model.vertexData;
		if (vertexData.length !== newVertexData.length) throw Error("New vertex data must be the same length as the existing! Cannot update buffer indices."); // Safety net
		vertexData.set(newVertexData); // Copies the values over without changing the memory location
		(meshData as MeshData).model.updateBufferIndices_VertexBuffer(0, vertexData.length); // Send those changes off to the gpu
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
function overwritebufferdata(mesh: Mesh, piece: Piece) {
	const meshData = mesh.types[piece.type]!;

	const i = piece.index * STRIDE_PER_PIECE;

	const offsetCoord = coordutil.subtractCoordinates(piece.coords, mesh.offset);

	meshData.instanceData64[i] = offsetCoord[0];
	meshData.instanceData64[i + 1] = offsetCoord[1];
	meshData.model.instanceData[i] = offsetCoord[0];
	meshData.model.instanceData[i + 1] = offsetCoord[1];

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
function deletebufferdata(mesh: Mesh, piece: Piece) {
	const meshData = mesh.types[piece.type]!;

	const i = piece.index * STRIDE_PER_PIECE;

	meshData.instanceData64[i] = Infinity; // Unfortunately we can't set them to 0 to hide it, as an actual piece instance would be visible at [0,0]
	meshData.instanceData64[i + 1] = Infinity;
	meshData.model.instanceData[i] = Infinity;
	meshData.model.instanceData[i + 1] = Infinity;

	// Update the buffer on the gpu!
	meshData.model.updateBufferIndices_InstanceBuffer(i, STRIDE_PER_PIECE); // Update only the indices the piece was at
}


// Rendering ----------------------------------------------------------------------------------------


/**
 * Renders ever piece type mesh of the game, including voids,
 * translating and scaling them into position.
 */
function renderAll(gamefile: gamefile, mesh: Mesh) {

	const boardPos = boardpos.getBoardPos();
	const position: [number,number,number] = [ // Translate
        -boardPos[0] + mesh.offset[0], // Add the model's offset. 
        -boardPos[1] + mesh.offset[1],
        Z
    ]; // While separate these may each be big decimals, TOGETHER they should be small! No graphical glitches.
	const boardScale = boardpos.getBoardScale();
	const scale: [number,number,number] = [boardScale, boardScale, 1];

	if (boardpos.areZoomedOut() && !miniimage.isDisabled()) {
		// Only render voids
		mesh.types[rawTypes.VOID]?.model.render(position, scale);
		return;
	};

	// We can render everything...

	// Do we need to shift the instance data of the piece models? Are we out of bounds of our REGEN_RANGE?
	if (!boardpos.areZoomedOut() && isOffsetOutOfRangeOfRegenRange(mesh.offset)) shiftAll(gamefile, mesh);

	// Test if the rotation has changed
	const correctInverted = perspective.getIsViewingBlackPerspective();
	if (mesh.inverted !== correctInverted) rotateAll(mesh, correctInverted);


	for (const meshData of Object.values(mesh.types)) {
		// Use a custom tint uniform if our theme has custom colors for the players pieces
		meshData.model.render(position, scale);
	}
}

/**
 * Tests if the board position is atleast REGEN_RANGE-distance away from the current offset.
 * If so, each piece mesh data should be shifted to require less severe uniform translations when rendering.
 */
function isOffsetOutOfRangeOfRegenRange(offset: Coords) { // offset: [x,y]
	const boardPos = boardpos.getBoardPos();
	const xDiff = Math.abs(boardPos[0] - offset[0]);
	const yDiff = Math.abs(boardPos[1] - offset[1]);
	if (xDiff > REGEN_RANGE || yDiff > REGEN_RANGE) return true;
	return false;
}


// Exports --------------------------------------------------------------------------------------------


export default {
	regenAll,
	regenType,
	overwritebufferdata,
	deletebufferdata,
	renderAll,
};

export type {
	MeshData,
	Mesh,
};