// src/client/scripts/esm/board/rendering/renderable.ts

/**
 * Free create-functions that delegate to the interactive game's renderable factory.
 *
 * The game's factory is owned by its RenderContext; {@link init} points these functions at
 * it, so game-only callers write `createRenderable(...)` without threading a context.
 * Callers rendering into a different context (the variant-preview tooltip) go through their
 * own `ctx.renderable` instead.
 */

import type { ProgramMap } from '../../webgl/ProgramManager.js';
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

/** The interactive game's renderable factory, supplied at runtime by {@link init}. */
let gameFactory: RenderableFactory;

/** Points the free create-functions at the interactive game's factory. */
function init(factory: RenderableFactory): void {
	gameFactory = factory;
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
