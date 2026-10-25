// src/client/scripts/game/rendering/gamerenderable.ts

/**
 * Free create-functions that delegate to the interactive game's renderable factory.
 *
 * The game's factory is owned by its RenderContext; {@link init} points these functions at
 * it, so game-only callers write `createRenderable(...)` without threading a context.
 * Callers rendering into any other board's context go through its `ctx.renderable` instead.
 */

import type {
	Renderable,
	PersistentRenderable,
	RenderableFactory,
	PersistentRenderableInstanced,
} from '../../webgl/Renderable.js';

// State -----------------------------------------------------------------------

/** The interactive game's renderable factory, supplied at runtime by {@link init}. */
let gameFactory: RenderableFactory;

// Initialization --------------------------------------------------------------

/** Points the free create-functions at the interactive game's factory. */
function init(factory: RenderableFactory): void {
	gameFactory = factory;
}

// Creating Renderables --------------------------------------------------------

/** Creates a renderable model in the game's context. See {@link RenderableFactory}. */
function createRenderable(...args: Parameters<RenderableFactory['createRenderable']>): Renderable {
	return gameFactory.createRenderable(...args);
}

/** Creates an instanced renderable model in the game's context. */
function createRenderable_Instanced(
	...args: Parameters<RenderableFactory['createRenderable_Instanced']>
): Renderable {
	return gameFactory.createRenderable_Instanced(...args);
}

/** Creates an instanced renderable model in the game's context, given explicit attribute info. */
function createRenderable_Instanced_GivenInfo(
	...args: Parameters<RenderableFactory['createRenderable_Instanced_GivenInfo']>
): Renderable {
	return gameFactory.createRenderable_Instanced_GivenInfo(...args);
}

/** Creates a renderable model in the game's context, kept across frames. */
function createPersistentRenderable(
	...args: Parameters<RenderableFactory['createPersistentRenderable']>
): PersistentRenderable {
	return gameFactory.createPersistentRenderable(...args);
}

/** Creates an instanced renderable model in the game's context, kept across frames. */
function createPersistentRenderable_Instanced(
	...args: Parameters<RenderableFactory['createPersistentRenderable_Instanced']>
): PersistentRenderableInstanced {
	return gameFactory.createPersistentRenderable_Instanced(...args);
}

// Exports ---------------------------------------------------------------------

export {
	createRenderable,
	createRenderable_Instanced,
	createRenderable_Instanced_GivenInfo,
	createPersistentRenderable,
	createPersistentRenderable_Instanced,
};

export default { init };
