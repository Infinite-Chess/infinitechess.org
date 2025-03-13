
/**
 * This generates and renders the meshes of each individual piece type in the game.
 */


import type { Coords } from '../../chess/util/coordutil.js';
import type { Color } from '../../chess/util/colorutil.js';
import type { Piece } from '../../chess/logic/boardchanges.js';
import type { PooledArray } from '../../chess/logic/organizedlines.js';
// @ts-ignore
import type { gamefile } from '../../chess/logic/gamefile.js';


import { AttributeInfoInstanced, BufferModelInstanced, createModel_Instanced, createModel_Instanced_GivenAttribInfo } from './buffermodel.js';
import coordutil from '../../chess/util/coordutil.js';
import instancedshapes from './instancedshapes.js';
import preferences from '../../components/header/preferences.js';
import colorutil from '../../chess/util/colorutil.js';
import svgcache from '../../chess/rendering/svgcache.js';
import { svgToImage } from '../../chess/rendering/svgtoimageconverter.js';
import math from '../../util/math.js';
import miniimage from './miniimage.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import texture from './texture.js';
// @ts-ignore
import { gl } from './webgl.js';
// @ts-ignore
import movement from './movement.js';


// Type Definitions ---------------------------------------------------------------------------------


/** Mesh data of a single piece type in gamefile.mesh.types */
interface MeshData {
	/** High precision instance data for performing arithmetic. */
	instanceData64: Float64Array,
	/** Buffere model for rendering. (This automatically stores the instanceData32 array going into the gpu) */
	model: BufferModelInstanced
}


// Variables ----------------------------------------------------------------------------------------


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

/** The color of void squares */
const VOID_COLOR: Color = [0, 0, 0, 1];
// const VOID_COLOR: Color = [0, 0, 1, 0.3]; // Transparent blue for debugging


// Generating Meshes ------------------------------------------------------------------------


/**
 * Regenerates every single piece mesh in the gamefile.
 * Call when first loading a game.
 * 
 * SLOWEST. Minimize calling.
 */
async function regenAll(gamefile: gamefile) {
	console.log("Regenerating all piece type meshes.");

	// Update the offset
	gamefile.mesh.offset = math.roundPointToNearestGridpoint(movement.getBoardPos(), REGEN_RANGE);
	// Calculate whether the textures should be inverted or not, based on whether we're viewing black's perspective.
	gamefile.mesh.inverted = perspective.getIsViewingBlackPerspective();

	// For each piece type in the game, generate its mesh
	for (const type of Object.keys(gamefile.ourPieces)) { // pawnsW
		if (type === 'voidsN') gamefile.mesh[type] = genVoidModel(gamefile); // Custom mesh generation logic for voids
		else gamefile.mesh.types[type] = await genTypeModel(gamefile, type); // Normal generation logic for all pieces with a texture
	}
}

/**
 * Regenerates the single model of the provided type.
 * Call externally after adding more undefined placeholders to a type list.
 * @param gamefile
 * @param type - The type of piece to regen the model for (e.g. 'pawnsW')
 */
async function regenType(gamefile: gamefile, type: string) {
	console.log(`Regenerating mesh of type ${type}.`);

	if (type === 'voidsN') gamefile.mesh[type] = genVoidModel(gamefile); // Custom mesh generation logic for voids
	else gamefile.mesh[type] = await genTypeModel(gamefile, type); // Normal generation logic for all pieces with a texture
}

/**
 * Generates the mesh data for a specific piece type in the gamefile that has a texture. (not compatible with voids)
 * Must be called whenever we add more undefineds placeholders to the this piece list.
 * 
 * SLOWEST. Minimize calling.
 * @param gamefile
 * @param type - The type of piece of which to generate the model for (e.g. "pawnsW")
 */
async function genTypeModel(gamefile: gamefile, type: string): Promise<MeshData> {
	// const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(VOID_COLOR); // VOIDS
	const vertexData = instancedshapes.getDataTexture(gamefile.mesh.inverted);
	const instanceData64: Float64Array = getInstanceDataForTypeList(gamefile, gamefile.ourPieces[type]);

	const svg: SVGElement = (await svgcache.getSVGElements([type], 32, 32))[0]!;
	console.log("Converting svg to image again..");
	const image: HTMLImageElement = await svgToImage(svg);
	const tex: WebGLTexture = texture.loadTexture(gl, image, { useMipmaps: true });

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
function genVoidModel(gamefile: gamefile): MeshData {
	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(VOID_COLOR);
	const instanceData64: Float64Array = getInstanceDataForTypeList(gamefile, gamefile.ourPieces.voidsN);

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
function getInstanceDataForTypeList(gamefile: gamefile, pieceList: PooledArray<Coords>): Float64Array {
	const instanceData64: Float64Array = new Float64Array(pieceList.length * STRIDE_PER_PIECE); // Initialize with all 0's

	let currIndex: number = 0;
	pieceList.forEach((coords: Coords | undefined) => {
		if (coords === undefined) {
			// Undefined placeholder, this one should not be visible. If we leave it at 0, then there would be a visible void at [0,0]
			instanceData64[currIndex] = Infinity;
			instanceData64[currIndex + 1] = Infinity;
		} else {
			// Apply the piece mesh offset to the coordinates
			instanceData64[currIndex] = coords[0] - gamefile.mesh.offset[0];
			instanceData64[currIndex + 1] = coords[1] - gamefile.mesh.offset[1];
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
function shiftAll(gamefile: gamefile) {
	console.log("Shifting all piece meshes.");

	const newOffset = math.roundPointToNearestGridpoint(movement.getBoardPos(), REGEN_RANGE);

	const diffXOffset = gamefile.mesh.offset[0] - newOffset[0];
	const diffYOffset = gamefile.mesh.offset[1] - newOffset[1];
	
	const chebyshevDistance = math.chebyshevDistance(gamefile.mesh.offset, newOffset);
	if (chebyshevDistance > DISTANCE_AT_WHICH_MESH_GLITCHES) {
		console.log(`REGENERATING the piece models instead of shifting them. They were shifted by ${chebyshevDistance} tiles!`);
		regenAll(gamefile);
		return;
	}

	gamefile.mesh.offset = newOffset;

	// Go ahead and shift each model
	for (const meshData of Object.values(gamefile.mesh.types)) {
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
function rotateAll(gamefile: gamefile, newInverted: boolean) {
	console.log("Rotating position data of all type meshes!");

	gamefile.mesh.inverted = newInverted;
	const newVertexData = instancedshapes.getDataTexture(gamefile.mesh.inverted);

	for (const [type, meshData] of Object.entries(gamefile.mesh.types)) {
		if (type === 'voidsN') continue; // Voids don't need to be rotated, they are symmetrical
		// Not a void, which means its guaranteed to be a piece with a texture...
		const vertexData = (meshData as MeshData).model.vertexData;
		if (vertexData.length !== newVertexData.length) throw Error("New vertex data must be the same length as the existing! Cannot update buffer indices."); // Safety net
		vertexData.set(newVertexData); // Copies the values over without changing the memory location
		(meshData as MeshData).model.updateBufferIndices_VertexBuffer(0, vertexData.length); // Send those changes off to the gpu
	}
}


// Modifying the Mesh Data ----------------------------------------------------------------------


/**
 * Overwrites the instance data of the specified piece within its
 * piece type mesh with the new coordinates of the instance.
 * Then sends that change off to the gpu.
 * 
 * FAST, much faster than regenerating the entire mesh
 * whenever a piece moves or something is captured/generated!
 */
function overwritebufferdata(gamefile: gamefile, piece: Piece) {
	const meshData = gamefile.mesh.types[piece.type];

	const i = piece.index * STRIDE_PER_PIECE;

	const offsetCoord = coordutil.subtractCoordinates(piece.coords, gamefile.mesh.offset);

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
function deletebufferdata(gamefile: gamefile, piece: { type: string, index: number }) {
	const meshData = gamefile.mesh.types[piece.type];

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
function renderAll(gamefile: gamefile) {
	if (movement.isScaleLess1Pixel_Virtual() && !miniimage.isDisabled()) return;

	// Do we need to shift the instance data of the piece models? Are we out of bounds of our REGEN_RANGE?
	if (!movement.isScaleLess1Pixel_Virtual() && isOffsetOutOfRangeOfRegenRange(gamefile.mesh.offset)) shiftAll(gamefile);

	// Go ahead and render...

	// Test if the rotation has changed
	const correctInverted = perspective.getIsViewingBlackPerspective();
	if (gamefile.mesh.inverted !== correctInverted) rotateAll(gamefile, correctInverted);

	const boardPos = movement.getBoardPos();
	const position: [number,number,number] = [ // Translate
        -boardPos[0] + gamefile.mesh.offset[0], // Add the model's offset. 
        -boardPos[1] + gamefile.mesh.offset[1],
        0
    ]; // While separate these may each be big decimals, TOGETHER they should be small! No graphical glitches.
	const boardScale = movement.getBoardScale();
	const scale: [number,number,number] = [boardScale, boardScale, 1];
	const colorArgs = preferences.getPieceRegenColorArgs();

	for (const [type, meshData] of Object.entries(gamefile.mesh.types)) {
		// Use a custom tint uniform if our theme has custom colors for the players pieces
		const uniforms = colorArgs ? { tintColor: colorArgs[colorutil.getPieceColorFromType(type)]! } : undefined;
		(meshData as MeshData).model.render(position, scale, uniforms);
	}
}

/**
 * Tests if the board position is atleast REGEN_RANGE-distance away from the current offset.
 * If so, each piece mesh data should be shifted to require less severe uniform translations when rendering.
 */
function isOffsetOutOfRangeOfRegenRange(offset: Coords) { // offset: [x,y]
	const boardPos = movement.getBoardPos();
	const xDiff = Math.abs(boardPos[0] - offset[0]);
	const yDiff = Math.abs(boardPos[1] - offset[1]);
	if (xDiff > REGEN_RANGE || yDiff > REGEN_RANGE) return true;
	return false;
}


// Exports --------------------------------------------------------------------------------------------


export default {
	REGEN_RANGE,
	regenAll,
	regenType,
	overwritebufferdata,
	deletebufferdata,
	renderAll,
};

export type {
	MeshData,
};