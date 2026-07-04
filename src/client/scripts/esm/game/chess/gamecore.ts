// src/client/scripts/esm/game/chess/gamecore.ts

/**
 * This script runs the update and render loops of the interactive game.
 * Shared across multiple pages (game, analysis, editor...).
 */

import type { Mesh } from '../rendering/piecemodels.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';

import clock from '../../../../../shared/chess/logic/clock.js';
import bimath from '../../../../../shared/util/math/bimath.js';

import mouse from '../../util/mouse.js';
import pieces from '../rendering/pieces.js';
import arrows from '../rendering/arrows/arrows.js';
import border from '../rendering/border.js';
import camera from '../rendering/camera.js';
import gameslot from './gameslot.js';
import boardpos from '../rendering/boardpos.js';
import controls from '../misc/controls.js';
import snapping from '../rendering/highlights/snapping.js';
import guiclock from '../gui/guiclock.js';
import premoves from './premoves.js';
import keybinds from '../misc/keybinds.js';
import animation from '../rendering/animation.js';
import selection from './selection.js';
import boarddrag from '../rendering/boarddrag.js';
import starfield from '../rendering/starfield.js';
import gamesound from '../misc/gamesound.js';
import highlights from '../rendering/highlights/highlights.js';
import droparrows from '../rendering/dragging/droparrows.js';
import dragarrows from '../rendering/dragging/dragarrows.js';
import boardtiles from '../rendering/boardtiles.js';
import Transition from '../rendering/transitions/Transition.js';
import maskedDraw from '../../webgl/maskedDraw.js';
import Renderable from '../../webgl/Renderable.js';
import gamesession from './gamesession.js';
import arrowshifts from '../rendering/arrows/arrowshifts.js';
import annotations from '../rendering/highlights/annotations/annotations.js';
import perspective from '../rendering/perspective.js';
import piecemodels from '../rendering/piecemodels.js';
import screenshake from '../rendering/screenshake.js';
import { GameBus } from '../GameBus.js';
import coordinates from '../rendering/coordinates.js';
import frametracker from '../rendering/frametracker.js';
import WaterRipples from '../rendering/WaterRipples.js';
import draganimation from '../rendering/dragging/draganimation.js';
import webgl, { gl } from '../rendering/webgl.js';
import promotionlines from '../rendering/promotionlines.js';
import arrowsgraphics from '../rendering/arrows/arrowsgraphics.js';
import guiboardcontrols from '../gui/guiboardcontrols.js';
import { ProgramManager } from '../../webgl/ProgramManager.js';
import { EffectZoneManager } from '../rendering/effect_zone/EffectZoneManager.js';
import arrowlegalmovehighlights from '../rendering/arrows/arrowlegalmovehighlights.js';
import selectedpiecehighlightline from '../rendering/highlights/selectedpiecehighlightline.js';
import { CreateInputListener, InputListener } from '../input.js';
import {
	PostProcessingPipeline,
	PostProcessPass,
} from '../../webgl/post_processing/PostProcessingPipeline.js';

// Variables -------------------------------------------------------------------------------

let element_canvas: HTMLCanvasElement;
/** The input listener for the board canvas */
let listener_canvas: InputListener;
/** The input listener for the document element */
let listener_document: InputListener;

/** Manager of our Shaders */
let programManager: ProgramManager;
/** Manager of Post Processing Effects */
let pipeline: PostProcessingPipeline;
/** Manager of Effect Zones */
let effectZoneManager: EffectZoneManager | undefined;

// /**
//  * Replaces the starfield with a gradient color flow inside void.
//  * Used for creating video footage.
//  */
// let colorFlowRenderer: ColorFlowRenderer;

// Functions -------------------------------------------------------------------------------

function init(canvas: HTMLCanvasElement): void {
	element_canvas = canvas;
	programManager = new ProgramManager(gl);
	Renderable.init(gl, programManager);
	maskedDraw.init(programManager);
	boardtiles.init();

	pipeline = new PostProcessingPipeline(gl, programManager);
	effectZoneManager = new EffectZoneManager(gl, programManager);
	// colorFlowRenderer = new ColorFlowRenderer(gl);
	WaterRipples.init(programManager, gl.canvas.width, gl.canvas.height);

	listener_canvas = CreateInputListener(element_canvas, { keyboard: false });
	listener_document = CreateInputListener(document);

	// Update the pipeline on canvas resize
	document.addEventListener('canvas_resize', (event) => {
		const { width, height } = event.detail;
		pipeline.resize(width, height);
	});

	preloadSounds();
}

/** Preloads all game sounds so they are ready to play without delay. */
function preloadSounds(): void {
	gamesound.preload('move');
	gamesound.preload('capture');
	gamesound.preload('bell');
	gamesound.preload('ripple_a3');
	gamesound.preload('base_staccato_c2');
	gamesound.preload('notify');
	gamesound.preload('low_time');
}

// Update the game every single frame
function update(): void {
	screenshake.update();
	controls.testOutGameToggles();
	if (gamesession.isLoading()) return; // If the game isn't totally finished loading, nothing is visible, only the background.

	// Any input should trigger the next frame to render.
	if (listener_document.atleastOneInput() || listener_canvas.atleastOneInput())
		frametracker.onVisualChange();

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;

	starfield.update(); // Update the star field animation, if needed.

	controls.testInGameToggles(gamefile, mesh);

	const timeWinner = clock.update(gamefile); // undefined if no clock has ran out
	// If the clock has ran out, and we are in an engine game, conclude the game.
	if (timeWinner !== undefined && gamesession.getGameType() === 'engine') {
		gamefile.gameConclusion = { victor: timeWinner, condition: 'time' };
		gameslot.concludeGame();
	}
	guiclock.update(gamefile);

	controls.updateNavControls(); // Update board dragging, and WASD to move, scroll to zoom
	if (!Transition.areTransitioning()) boardpos.update(); // Updates the board's position and scale according to its velocity

	boarddrag.dragBoard(); // Calculate new board position if it's being dragged. After updateNavControls(), boardpos.update()
	// BEFORE board.recalcVariables(), as that needs to be called after the board position is updated.
	Transition.update();
	// AFTER boarddrag.dragBoard() or picking up the board has a spring back effect to it
	// AFTER transition.update() since that updates the board position
	boardtiles.recalcVariables();

	// Update the effect zone manager (after board variables are recalculated).
	effectZoneManager!.update(getFurthestTileVisible());

	// Check if the board needs to be pinched (will not single-pointer grab)
	// This needs to be early in the update loop, as pinching the board has priority over the pointer than a lot of things.
	boarddrag.checkIfBoardPinched();

	// NEEDS TO BE BEFORE arrows.update(), since this may forward to front, which changes all arrows visible.
	selection.update();
	arrows.update();
	// NEEDS TO BE AFTER arrows.update() because this modifies the arrow indicator list.
	// NEEDS TO BE BEFORE boarddrag.checkIfBoardSingleGrabbed() because that shift arrows needs to overwrite this.
	animation.update();
	draganimation.updateDragLocation(); // BEFORE droparrows.shiftArrows() so that can overwrite this.
	droparrows.shiftArrows(); // Shift the arrows of the dragged piece AFTER selection.update() makes any moves made!
	dragarrows.update(); // AFTER droparrows.shiftArrows(), BEFORE executeArrowShifts().
	arrowshifts.executeArrowShifts(); // Execute any arrow modifications made by animation.js or arrowsdrop.js. BEFORE arrowlegalmovehighlights.update()
	droparrows.updateLegalCaptureArrows(); // AFTER executeArrowShifts(), so rebuilt arrow lines don't reset pulsating opacities.

	arrowlegalmovehighlights.update(); // AFTER executeArrowShifts()

	// NEEDS TO BE BEFORE annotations.update() since adding new highlights snaps to what mini image is being hovered over.
	// BEFORE checkIfBoardSingleGrabbed(), because clicks should prioritize teleporting to miniimages over dragging the board!
	snapping.transitionToHoveredIfClicked();
	premoves.update(gamefile, mesh); // BEFORE annotations.update(), since if right click cancels premoves, we don't want to draw arrows.
	// AFTER snapping updates entities hovered, since adding/removing depends on current hovered entities.
	annotations.update();

	// AFTER snapping updates, since clicking on a highlight line should claim the click that would other wise collapse all annotations.
	testIfEmptyBoardRegionClicked(gamefile, mesh); // If we clicked an empty region of the board, collapse annotations and cancel premoves.
	// Now we can check if the board needs to be single-pointer grabbed, as other scripts may have claimed the pointer first.
	// AFTER: selection.update(), animation.update() because shift arrows needs to overwrite that.
	// After snapping updates entities hovered, because clicks prioritize those.
	boarddrag.checkIfBoardSingleGrabbed();

	guiboardcontrols.updateCoords(); // Update the coordinates on the side bar

	// preferences.update(); // ONLY USED for temporarily micro adjusting theme properties & colors
}

/**
 * Tests if by clicking an empty region of the board,
 * we need to clear premoves and collapse annotations.
 */
function testIfEmptyBoardRegionClicked(gamefile: GameFile, mesh: Mesh | undefined): void {
	const mouseKeybind = keybinds.getCollapseMouseButton();
	if (mouseKeybind === undefined) return; // No button is assigned to collaping annotes / cancelling premoves currently

	if (mouse.isMouseClicked(mouseKeybind)) {
		mouse.claimMouseClick(mouseKeybind);

		premoves.cancelPremoves(gamefile, mesh);
		annotations.Collapse();
	}
}

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
	maskedDraw.execute(
		() => piecemodels.renderVoids(mesh), // INCLUSION MASK is our voids
		() => border.drawPlayableRegionMask(gamefile.gameRules.worldBorder), // EXCLUSION MASK is our playable region
		() => starfield.render(), // MAIN SCENE
		// () => colorFlowRenderer.render(frameprofiler.getDeltaTime()), // Replaces starfield with a gradient color flow
		'or', // Intersection Mode: Draw in both the inclusion and inversion of exclusion regions.
	);
	// Board Tiles & Voids: Mask the playable region so the tiles
	// don't render outside the world border or where voids should be
	maskedDraw.execute(
		() => border.drawPlayableRegionMask(gamefile.gameRules.worldBorder), // INCLUSION MASK containing playable region
		() => piecemodels.renderVoids(mesh), // EXCLUSION MASK (voids)
		() => renderTilesAndPromoteLines(gamefile), // MAIN SCENE
		'and', // Intersection Mode: Draw where the inclusion and inversion of exclusion regions intersect.
	);

	camera.renderOutlineofScreenBox();

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
	pieces.renderPiecesInGame(gamefile, mesh);

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
	effectZoneManager!.renderBoard();

	// The start box determines how far out promotion lines are rendered.
	// In editor mode, don't provide it, so the lines extend to the screen edges.
	const startBox = gamefile.editor ? undefined : gamefile.startSnapshot.box;
	promotionlines.render(gamefile.gameRules.promotion, startBox);
}

/** Returns the absolute value of the furthest tile from the origin on our screen. */
function getFurthestTileVisible(): bigint {
	const tileBox = boardtiles.gboundingBox(false);
	let furthest: bigint = 0n;
	furthest = bimath.max(furthest, bimath.abs(tileBox.left));
	furthest = bimath.max(furthest, bimath.abs(tileBox.right));
	furthest = bimath.max(furthest, bimath.abs(tileBox.bottom));
	furthest = bimath.max(furthest, bimath.abs(tileBox.top));
	return furthest;
}

/** Returns the overlay element covering the entire canvas. */
function getCanvas(): HTMLElement {
	return element_canvas;
}

export default {
	init,
	update,
	render,
	getCanvas,
};

export { listener_canvas, listener_document };
