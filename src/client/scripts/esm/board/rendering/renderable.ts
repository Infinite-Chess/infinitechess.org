// src/client/scripts/esm/board/rendering/renderable.ts

/**
 * The board's renderable factory, and the free create-functions that delegate to it.
 *
 * Every board page shares one WebGL context and one camera, so it shares one factory,
 * built at runtime by {@link init}. Callers needing their own context (the variant-preview
 * tooltip) build their own factory from webgl/Renderable directly.
 */

import type { ProgramManager, ProgramMap } from '../../webgl/ProgramManager.js';
import type {
	AttributeInfo,
	AttributeInfoInstanced,
	InputArray,
	PrimitiveType,
	Renderable,
	RenderableFactory,
	RenderableInstanced,
	TextureInfo,
} from '../../webgl/Renderable.js';

import camera from './camera.js';
import { createRenderableFactory } from '../../webgl/Renderable.js';

/** The interactive game's renderable factory, created at runtime by {@link init}. */
let gameFactory: RenderableFactory;

/** Initializes the game's factory with the game's WebGL context and ProgramManager. */
function init(context: WebGL2RenderingContext, program_manager: ProgramManager): void {
	gameFactory = createRenderableFactory(context, program_manager, camera);
}

/** Creates a renderable model in the game's context. See {@link RenderableFactory}. */
function createRenderable(
	data: InputArray,
	numPositionComponents: 2 | 3,
	mode: PrimitiveType,
	shader: keyof ProgramMap,
	usingColor: boolean,
	texture?: WebGLTexture,
): Renderable {
	return gameFactory.createRenderable(data, numPositionComponents, mode, shader, usingColor, texture); // prettier-ignore
}

/** Creates an instanced renderable model in the game's context. */
function createRenderable_Instanced(
	vertexData: InputArray,
	instanceData: InputArray,
	mode: PrimitiveType,
	shader: keyof ProgramMap,
	usingColor: boolean,
	texture?: WebGLTexture,
): RenderableInstanced {
	return gameFactory.createRenderable_Instanced(vertexData, instanceData, mode, shader, usingColor, texture); // prettier-ignore
}

/** Creates a renderable model in the game's context, given explicit attribute info. */
function createRenderable_GivenInfo<K extends keyof ProgramMap>(
	data: InputArray,
	attribInfo: AttributeInfo,
	mode: PrimitiveType,
	shader: K,
	textures: TextureInfo[] = [],
): Renderable {
	return gameFactory.createRenderable_GivenInfo(data, attribInfo, mode, shader, textures);
}

/** Creates an instanced renderable model in the game's context, given explicit attribute info. */
function createRenderable_Instanced_GivenInfo<K extends keyof ProgramMap>(
	vertexData: InputArray,
	instanceData: InputArray,
	attribInfoInstanced: AttributeInfoInstanced,
	mode: PrimitiveType,
	shader: K,
	textures: TextureInfo[] = [],
): RenderableInstanced {
	return gameFactory.createRenderable_Instanced_GivenInfo(vertexData, instanceData, attribInfoInstanced, mode, shader, textures); // prettier-ignore
}

export {
	createRenderable,
	createRenderable_GivenInfo,
	createRenderable_Instanced,
	createRenderable_Instanced_GivenInfo,
};

export default { init };
