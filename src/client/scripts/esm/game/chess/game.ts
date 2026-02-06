// src/client/scripts/esm/game/chess/game.ts

/**
 * This script prepares our game.
 *
 * And contains our main update() and render() methods
 */

import type { Mesh } from '../rendering/piecemodels.js';
import type { Color } from '../../../../../shared/util/math/math.js';
import type { FullGame } from '../../../../../shared/chess/logic/gamefile.js';

import gui from '../gui/gui.js';
import clock from '../../../../../shared/chess/logic/clock.js';
import mouse from '../../util/mouse.js';
import pieces from '../rendering/pieces.js';
import arrows from '../rendering/arrows/arrows.js';
import border from '../rendering/border.js';
import camera from '../rendering/camera.js';
import bimath from '../../../../../shared/util/math/bimath.js';
import invites from '../misc/invites.js';
import gameslot from './gameslot.js';
import guititle from '../gui/guititle.js';
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
import gameloader from './gameloader.js';
import highlights from '../rendering/highlights/highlights.js';
import droparrows from '../rendering/dragging/droparrows.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import boardtiles from '../rendering/boardtiles.js';
import Transition from '../rendering/transitions/Transition.js';
import primitives from '../rendering/primitives.js';
import annotations from '../rendering/highlights/annotations/annotations.js';
import boardeditor from '../boardeditor/boardeditor.js';
import perspective from '../rendering/perspective.js';
import piecemodels from '../rendering/piecemodels.js';
import screenshake from '../rendering/screenshake.js';
import { GameBus } from '../GameBus.js';
import frametracker from '../rendering/frametracker.js';
import WaterRipples from '../rendering/WaterRipples.js';
import guinavigation from '../gui/guinavigation.js';
import draganimation from '../rendering/dragging/draganimation.js';
import webgl, { gl } from '../rendering/webgl.js';
import promotionlines from '../rendering/promotionlines.js';
import { ProgramManager } from '../../webgl/ProgramManager.js';
import { EffectZoneManager } from '../rendering/effect_zone/EffectZoneManager.js';
import arrowlegalmovehighlights from '../rendering/arrows/arrowlegalmovehighlights.js';
import selectedpiecehighlightline from '../rendering/highlights/selectedpiecehighlightline.js';
import buffermodel, { createRenderable } from '../../webgl/Renderable.js';
import { CreateInputListener, InputListener } from '../input.js';
import {
	PostProcessingPipeline,
	PostProcessPass,
} from '../../webgl/post_processing/PostProcessingPipeline.js';

// Variables -------------------------------------------------------------------------------

const element_overlay: HTMLElement = document.getElementById('overlay')!;
/** The input listener for the overlay element */
let listener_overlay: InputListener;
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

function init(): void {
	programManager = new ProgramManager(gl);
	buffermodel.init(gl, programManager);

	pipeline = new PostProcessingPipeline(gl, programManager);
	effectZoneManager = new EffectZoneManager(gl, programManager);
	// colorFlowRenderer = new ColorFlowRenderer(gl);
	WaterRipples.init(programManager, gl.canvas.width, gl.canvas.height);
	boardtiles.init();

	listener_overlay = CreateInputListener(element_overlay, { keyboard: false });
	listener_document = CreateInputListener(document);

	gui.prepareForOpen();

	guititle.open();

	// Update the pipeline on canvas resize
	document.addEventListener('canvas_resize', (event) => {
		const { width, height } = event.detail;
		pipeline.resize(width, height);
	});
}

// Update the game every single frame
function update(): void {
	screenshake.update();
	controls.testOutGameToggles();
	invites.update();
	// Any input should trigger the next frame to render.
	if (listener_document.atleastOneInput() || listener_overlay.atleastOneInput())
		frametracker.onVisualChange();
	if (gameloader.areWeLoadingGame()) return; // If the game isn't totally finished loading, nothing is visible, only the loading animation.

	const gamefile = gameslot.getGamefile();
	const mesh = gameslot.getMesh();
	if (!gamefile) {
		// Only do title screen updates
		boardpos.update();
		boardtiles.recalcVariables();
		// Update the effect zone manager.
		effectZoneManager!.update(getFurthestTileVisible());
		return;
	}

	// There is a gamefile, update everything board-related...

	starfield.update(); // Update the star field animation, if needed.

	controls.testInGameToggles(gamefile, mesh);

	perspective.update(); // Update perspective camera according to mouse movement

	const timeWinner = clock.update(gamefile.basegame);
	if (timeWinner && !onlinegame.areInOnlineGame()) {
		// undefined if no clock has ran out
		gamefile.basegame.gameConclusion = `${timeWinner} time`;
		gameslot.concludeGame();
	}
	guiclock.update(gamefile.basegame);

	controls.updateNavControls(); // Update board dragging, and WASD to move, scroll to zoom
	boardpos.update(); // Updates the board's position and scale according to its velocity

	boarddrag.dragBoard(); // Calculate new board position if it's being dragged. After updateNavControls(), executeArrowShifts(), boardpos.update
	// BEFORE board.recalcVariables(), as that needs to be called after the board position is updated.
	Transition.update();
	// AFTER boarddrag.dragBoard() or picking up the board has a spring back effect to it
	// AFTER:transition.update() since that updates the board position
	boardtiles.recalcVariables();

	// Update the effect zone manager (after board variables are recalculated).
	effectZoneManager!.update(getFurthestTileVisible());

	// Check if the board needs to be pinched (will not single-pointer grab)
	// This needs to be high up, as pinching the board has priority over the pointer than a lot of things.
	boarddrag.checkIfBoardPinched();

	// NEEDS TO BE BEFORE selection.update() and boarddrag.checkIfBoardSingleGrabbed()
	// because the drawing tools of the boad editor might take precedence and claim the left mouse click
	boardeditor.update();

	// NEEDS TO BE AFTER animation.update() because this updates droparrows.ts and that needs to overwrite animations.
	// BEFORE arrows.update(), since this may forward to front, which changes all arrows visible.
	selection.update();
	// NEEDS TO BE AFTER guinavigation.update(), because otherwise arrows.js may think we are hovering
	// over a piece from before forwarding/rewinding a move, causing a crash.
	arrows.update();
	// NEEDS TO BE AFTER arrows.update() !!! Because this modifies the arrow indicator list.
	// NEEDS TO BE BEFORE boarddrag.checkIfBoardSingleGrabbed() because that shift arrows needs to overwrite this.
	animation.update();
	draganimation.updateDragLocation(); // BEFORE droparrows.shiftArrows() so that can overwrite this.
	droparrows.shiftArrows(); // Shift the arrows of the dragged piece AFTER selection.update() makes any moves made!
	arrows.executeArrowShifts(); // Execute any arrow modifications made by animation.js or arrowsdrop.js. Before arrowlegalmovehighlights.update(), dragBoard()

	arrowlegalmovehighlights.update(); // After executeArrowShifts()

	// BEFORE annotations.update() since adding new highlights snaps to what mini image is being hovered over.
	// NEEDS TO BE BEFORE checkIfBoardDragged(), because clicks should prioritize teleporting to miniimages over dragging the board!
	// AFTER: boardpos.dragBoard(), because whether the miniimage are visible or not depends on our updated board position and scale.
	snapping.teleportToEntitiesIfClicked(); // AFTER snapping.updateEntitiesHovered()
	snapping.teleportToSnapIfClicked();
	premoves.update(gamefile, mesh); // BEFORE annotations update(), since if right click cancels premoves, we don't want to draw arrows.
	// AFTER snapping.updateEntitiesHovered(), since adding/removing depends on current hovered entities.
	annotations.update();

	// AFTER snapping.updateSnapping(), since clicking on a highlight line should claim the click that would other wise collapse all annotations.
	testIfEmptyBoardRegionClicked(gamefile, mesh); // If we clicked an empty region of the board, collapse annotations and cancel premoves.
	// Now we can check if the board needs to be single-pointer grabbed,
	// as other scripts may have claimed the pointer first.
	// AFTER: selection.update(), animation.update() because shift arrows needs to overwrite that.
	// After entities.updateEntitiesHovered() because clicks prioritize those.
	boarddrag.checkIfBoardSingleGrabbed();

	gameloader.update(); // Updates whatever game is currently loaded.

	guinavigation.updateElement_Coords(); // Update the division on the screen displaying your current coordinates

	// preferences.update(); // ONLY USED for temporarily micro adjusting theme properties & colors
}

/**
 * Tests if by clicking an empty region of the board,
 * we need to clear premoves and collapse annotations.
 */
function testIfEmptyBoardRegionClicked(gamefile: FullGame, mesh: Mesh | undefined): void {
	const mouseKeybind = keybinds.getCollapseMouseButton();
	if (mouseKeybind === undefined) return; // No button is assigned to collaping annotes / cancelling premoves currently

	if (mouse.isMouseClicked(mouseKeybind)) {
		mouse.claimMouseClick(mouseKeybind);

		premoves.cancelPremoves(gamefile, mesh);
		annotations.Collapse();
	}
}

/**
 * Renders everthing in-game, and applies post processing effects to the final image.
 */
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
	if (gameloader.areWeLoadingGame()) return; // If the game isn't totally finished loading, nothing is visible, only the loading animation.

	const gamefile = gameslot.getGamefile();
	const mesh = gameslot.getMesh();
	// if (!gamefile) return boardtiles.render(); // No gamefile, on the selection menu. Only render the checkerboard and nothing else.
	if (!gamefile) {
		effectZoneManager!.renderBoard();
		return;
	}

	// Star Field Animation: Appears in border & voids
	webgl.executeMaskedDraw(
		() => piecemodels.renderVoids(mesh), // INCLUSION MASK is our voids
		() => border.drawPlayableRegionMask(gamefile.basegame.gameRules.worldBorder), // EXCLUSION MASK is our playable region
		() => starfield.render(), // MAIN SCENE
		// () => colorFlowRenderer.render(loadbalancer.getDeltaTime()), // Replaces starfield with a gradient color flow
		'or', // Intersection Mode: Draw in both the inclusion and inversion of exclusion regions.
	);
	// Board Tiles & Voids: Mask the playable region so the tiles
	// don't render outside the world border or where voids should be
	webgl.executeMaskedDraw(
		() => border.drawPlayableRegionMask(gamefile.basegame.gameRules.worldBorder), // INCLUSION MASK containing playable region
		() => piecemodels.renderVoids(mesh), // EXCLUSION MASK (voids)
		() => renderTilesAndPromoteLines(), // MAIN SCENE
		'and', // Intersection Mode: Draw where the inclusion and inversion of exclusion regions intersect.
	);

	if (camera.getDebug() && !perspective.getEnabled()) renderOutlineofScreenBox();

	/**
	 * What is the order of rendering?
	 *
	 * Board tiles
	 * Highlights
	 * Pieces
	 * Arrows
	 * Crosshair
	 */

	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		selectedpiecehighlightline.render();
		highlights.render(gamefile.boardsim);
		GameBus.dispatch('render-below-pieces');
		snapping.render(); // Renders ghost image or glow dot over snapped point on highlight lines.
		animation.renderTransparentSquares(); // Required to hide the piece currently being animated
		draganimation.renderTransparentSquare(); // Required to hide the piece currently being animated
	});

	// The rendering of the pieces needs to use the normal depth function, because the
	// rendering of currently-animated pieces needs to be blocked by animations.
	pieces.renderPiecesInGame(gamefile.boardsim, mesh);

	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		animation.renderAnimations();
		selection.renderGhostPiece(); // If not after pieces.renderPiecesInGame(), wont render on top of existing pieces
		draganimation.renderPiece();
		arrows.render();
		boardeditor.render();
		annotations.render_abovePieces();
		GameBus.dispatch('render-above-pieces');
		perspective.renderCrosshair();
	});
}

/** Renders items that need to be able to be masked by the world border. */
function renderTilesAndPromoteLines(): void {
	effectZoneManager!.renderBoard();
	promotionlines.render();
}

/**
 * [DEBUG] Renders an outline of the viewing screen bounding box.
 * Will only be visible if camera debug mode is on.
 */
function renderOutlineofScreenBox(): void {
	const { left, right, bottom, top } = camera.getScreenBoundingBox(false);

	// const color: Color = [0.65,0.15,0, 1]; // Maroon (matches light brown wood theme)
	const color: Color = [0, 0, 0, 0.5]; // Transparent Black
	const data = primitives.Rect(left, bottom, right, top, color);

	createRenderable(data, 2, 'LINE_LOOP', 'color', true).render();
}

/** Returns the absolute value of the furthest tile from the origin on our screen. */
function getFurthestTileVisible(): bigint {
	const tileBox = boardtiles.gboundingBox(false);
	let furthest: bigint = 0n;
	if (bimath.abs(tileBox.left) > furthest) furthest = bimath.abs(tileBox.left);
	if (bimath.abs(tileBox.right) > furthest) furthest = bimath.abs(tileBox.right);
	if (bimath.abs(tileBox.top) > furthest) furthest = bimath.abs(tileBox.top);
	if (bimath.abs(tileBox.bottom) > furthest) furthest = bimath.abs(tileBox.bottom);
	return furthest;
}

/** Returns the overlay element covering the entire canvas. */
function getOverlay(): HTMLElement {
	return element_overlay;
}

export default {
	init,
	update,
	render,
	getOverlay,
};

export { listener_overlay, listener_document };
