// src/client/scripts/esm/game/rendering/gamescene.ts

/**
 * The interactive game's scene: it builds the render context every other draw call needs
 * (shaders, post-processing pipeline, effect zones), then draws the whole board with it in
 * the correct order.
 *
 * Owning the context and drawing with it are one job — {@link init} creates exactly what
 * {@link render} consumes. Adding a new visual means calling it from {@link renderScene}
 * in the right section.
 */

import type { Color } from '../../../../../shared/types/color.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { PostProcessPass } from '../../webgl/postprocessing/PostProcessPass.js';

import bimath from '../../../../../shared/util/math/bimath.js';

import pieces from './pieces.js';
import border from '../../board/rendering/border.js';
import camera from '../../board/rendering/camera.js';
import gameslot from '../chess/gameslot.js';
import boardpos from '../../board/rendering/boardpos.js';
import snapping from './highlights/snapping.js';
import selection from '../chess/selection.js';
import animation from './animation.js';
import starfield from './starfield.js';
import highlights from './highlights/highlights.js';
import dragarrows from './dragging/dragarrows.js';
import maskeddraw from '../../webgl/maskeddraw.js';
import primitives from '../../board/rendering/primitives.js';
import annotations from './highlights/annotations/annotations.js';
import perspective from './perspective.js';
import piecemodels from '../../board/rendering/piecemodels.js';
import { GameBus } from '../../board/GameBus.js';
import coordinates from './coordinates.js';
import texturecache from '../../chess/rendering/texturecache.js';
import WaterRipples from './WaterRipples.js';
import boardgeometry from '../../board/rendering/boardgeometry.js';
import RenderContext from '../../board/rendering/RenderContext.js';
import draganimation from './dragging/draganimation.js';
import webgl, { gl } from '../../board/rendering/webgl.js';
import promotionlines from '../../board/rendering/promotionlines.js';
import arrowsgraphics from './arrows/arrowsgraphics.js';
import { ProgramManager } from '../../webgl/ProgramManager.js';
import { EffectZoneManager } from './effectzone/EffectZoneManager.js';
import selectedpiecehighlightline from './highlights/selectedpiecehighlightline.js';
import { PostProcessingPipeline } from '../../webgl/postprocessing/PostProcessingPipeline.js';
import Renderable, { createRenderable } from '../../board/rendering/renderable.js';

// State -----------------------------------------------------------------------

/** Manager of our Shaders */
let programManager: ProgramManager;
/** The interactive game's render context (gl, camera, boardpos, textures, tile renderer...). */
let gameContext: RenderContext;
/** Manager of Post Processing Effects */
let pipeline: PostProcessingPipeline;
/** Manager of Effect Zones */
let effectZoneManager: EffectZoneManager | undefined;

// /**
//  * Replaces the starfield with a gradient color flow inside void.
//  * Used for creating video footage.
//  */
// let colorFlowRenderer: ColorFlowRenderer;

// Setup -----------------------------------------------------------------------

/** Builds the game's render context and every manager drawing through it. */
function init(canvas: HTMLCanvasElement): void {
	programManager = new ProgramManager(gl);
	const gameMasker = maskeddraw.init(gl, programManager);
	gameContext = new RenderContext({
		gl,
		canvas,
		programManager,
		camera,
		boardpos,
		textures: texturecache,
		maskedDraw: gameMasker,
	});
	Renderable.init(gameContext.renderable); // Point the free create-functions at this context's factory
	gameContext.boardtiles.init();

	pipeline = new PostProcessingPipeline(gl, programManager);
	effectZoneManager = new EffectZoneManager(gl, programManager);
	// colorFlowRenderer = new ColorFlowRenderer(gl);
	WaterRipples.init(programManager, gl.canvas.width, gl.canvas.height);

	// Update the pipeline on canvas resize
	GameBus.addEventListener('canvas-resize', (event) => {
		const { width, height } = event.detail;
		pipeline.resize(width, height);
	});
}

/** Returns the interactive game's render context. Must be called after {@link init}. */
function getGameContext(): RenderContext {
	return gameContext;
}

// Update ----------------------------------------------------------------------

/** Advances the effect zone to whichever zone the visible board now falls in. */
function updateEffectZone(): void {
	effectZoneManager!.update(getFurthestTileVisible());
}

/** Returns the absolute value of the furthest tile from the origin on our screen. */
function getFurthestTileVisible(): bigint {
	const tileBox = boardgeometry.gboundingBox(false);
	let furthest: bigint = 0n;
	furthest = bimath.max(furthest, bimath.abs(tileBox.left));
	furthest = bimath.max(furthest, bimath.abs(tileBox.right));
	furthest = bimath.max(furthest, bimath.abs(tileBox.bottom));
	furthest = bimath.max(furthest, bimath.abs(tileBox.top));
	return furthest;
}

// Render ----------------------------------------------------------------------

/** Renders everthing in-game, and applies post processing effects to the final image. */
function render(): void {
	// First gather all post processing effects this frame
	const passes: PostProcessPass[] = [];
	// Append water ripples of really far moves!
	passes.push(...WaterRipples.getPass());
	// Add the current effect zone passes
	passes.push(...effectZoneManager!.getActivePostProcessPasses());
	// Set them in the pipeline
	pipeline.setPasses(passes);

	// Only use the pipeline if there are any current effects,
	// as a completely empty pipeline still increases gpu usage by roughly 33%

	// Tell the pipeline to begin. All subsequent rendering will go to a texture.
	if (passes.length > 0) pipeline.begin();

	// Render the game scene
	renderScene();

	// Tell the pipeline we are finished drawing the scene.
	// It will handle drawing the result to the screen.
	if (passes.length > 0) pipeline.end();
}

/** Renders all in our scene. */
function renderScene(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;

	/**
	 * Order of rendering:
	 *
	 * Board tiles
	 * Highlights
	 * Pieces
	 * Arrows
	 * Crosshair
	 */

	// Star Field Animation: Appears in border & voids
	maskeddraw.execute(
		() => piecemodels.renderVoids(gameContext, mesh), // INCLUSION MASK is our voids
		() => border.drawPlayableRegionMask(gameContext, gamefile.gameRules.worldBorder), // EXCLUSION MASK is our playable region
		() => starfield.render(), // MAIN SCENE
		// () => colorFlowRenderer.render(frameprofiler.getDeltaTime()), // Replaces starfield with a gradient color flow
		'or', // Intersection Mode: Draw in both the inclusion and inversion of exclusion regions.
	);
	// Board Tiles & Voids: Mask the playable region so the tiles
	// don't render outside the world border or where voids should be
	maskeddraw.execute(
		() => border.drawPlayableRegionMask(gameContext, gamefile.gameRules.worldBorder), // INCLUSION MASK containing playable region
		() => piecemodels.renderVoids(gameContext, mesh), // EXCLUSION MASK (voids)
		() => renderTilesAndPromoteLines(gamefile), // MAIN SCENE
		'and', // Intersection Mode: Draw where the inclusion and inversion of exclusion regions intersect.
	);

	renderOutlineofScreenBox();

	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		coordinates.render();
		selectedpiecehighlightline.render();
		highlights.render(gamefile);
		GameBus.dispatch('render-below-pieces');
		snapping.render(); // Renders ghost image or glow dot over snapped point on highlight lines.
		animation.renderTransparentSquares(); // Required to hide the piece currently being animated
		draganimation.renderTransparentSquare(); // Required to hide the piece currently being animated
	});

	// The rendering of the pieces needs to use the normal depth function, because the
	// rendering of currently-animated pieces needs to be blocked by animations.
	pieces.renderPiecesInGame(gameContext, mesh);

	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		animation.renderAnimations();
		selection.renderGhostPiece(); // If not after pieces.renderPiecesInGame(), wont render on top of existing pieces
		draganimation.renderPiece();
		dragarrows.render();
		arrowsgraphics.render();
		GameBus.dispatch('render-above-pieces');
		annotations.render_abovePieces();
		perspective.renderCrosshair();
	});
}

/** Renders items that need to be able to be masked by the world border. */
function renderTilesAndPromoteLines(gamefile: GameFile): void {
	effectZoneManager!.renderBoard(gameContext.boardtiles);

	// The start box determines how far out promotion lines are rendered.
	// In editor mode, don't provide it, so the lines extend to the screen edges.
	const startBox = gamefile.editor ? undefined : gamefile.startSnapshot.box;
	promotionlines.render(gameContext, gamefile.gameRules.promotion, startBox);
}

/**
 * [DEBUG] Renders an outline of the game camera's screen bounding box.
 * Only visible while camera debug mode is on, which pulls the camera back far
 * enough for the true screen edge to be inside the view.
 */
function renderOutlineofScreenBox(): void {
	if (!camera.getDebug() || camera.isCameraRotated()) return;

	const { left, right, bottom, top } = camera.getScreenBoundingBox(false);

	// const color: Color = [0.65,0.15,0, 1]; // Maroon (matches light brown wood theme)
	const color: Color = [0, 0, 0, 0.5]; // Transparent Black
	const data = primitives.Rect(left, bottom, right, top, color);

	createRenderable(data, 2, 'LINE_LOOP', 'color', true).render();
}

// Exports ---------------------------------------------------------------------

export default {
	init,
	getGameContext,
	updateEffectZone,
	render,
};
