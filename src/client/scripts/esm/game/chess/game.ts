
/**
 * This script prepares our game.
 * 
 * And contains our main update() and render() methods
 */


// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';


import gameloader from './gameloader.js';
import gui from '../gui/gui.js';
import jsutil from '../../util/jsutil.js';
import highlights from '../rendering/highlights/highlights.js';
import gameslot from './gameslot.js';
import guinavigation from '../gui/guinavigation.js';
import pieces from '../rendering/pieces.js';
import guititle from '../gui/guititle.js';
// @ts-ignore
import onlinegame from '../misc/onlinegame/onlinegame.js';
// @ts-ignore
import arrows from '../rendering/arrows/arrows.js';
// @ts-ignore
import invites from '../misc/invites.js';
// @ts-ignore
import guipause from '../gui/guipause.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import miniimage from '../rendering/miniimage.js';
// @ts-ignore
import clock from '../../chess/logic/clock.js';
// @ts-ignore
import guiclock from '../gui/guiclock.js';
// @ts-ignore
import movement from '../rendering/movement.js';
// @ts-ignore
import selection from './selection.js';
// @ts-ignore
import board from '../rendering/board.js';
// @ts-ignore
import animation from '../rendering/animation.js';
// @ts-ignore
import webgl from '../rendering/webgl.js';
// @ts-ignore
import perspective from '../rendering/perspective.js';
// @ts-ignore
import highlightline from '../rendering/highlights/highlightline.js';
// @ts-ignore
import transition from '../rendering/transition.js';
// @ts-ignore
import options from '../rendering/options.js';
// @ts-ignore
import promotionlines from '../rendering/promotionlines.js';
// @ts-ignore
import dragAnimation from '../rendering/dragging/draganimation.js';
// @ts-ignore
import piecesmodel from '../rendering/piecesmodel.js';
// @ts-ignore
import loadbalancer from '../misc/loadbalancer.js';
// @ts-ignore
import guigameinfo from '../gui/guigameinfo.js';
// @ts-ignore
import websocket from '../websocket.js';
// @ts-ignore
import voids from '../rendering/voids.js';
// @ts-ignore
import camera from '../rendering/camera.js';
// @ts-ignore
import copypastegame from './copypastegame.js';


// Functions -------------------------------------------------------------------------------


function init() {
	options.initTheme();

	gui.prepareForOpen();

	guititle.open();

	board.recalcTileWidth_Pixels(); // Without this, the first touch tile is NaN
}

// Update the game every single frame
function update() {
	testOutGameDebugToggles();
	invites.update();
	if (gameslot.areWeLoadingGraphics()) return; // If the graphics aren't finished loading, nothing is visible, only the loading animation.

	const gamefile = gameslot.getGamefile();
	if (!gamefile) return updateSelectionScreen(); // On title screen

	// There is a gamefile, update everything board-related...

	testInGameDebugToggles(gamefile);

	updateBoard(gamefile); // Other screen, board is visible, update everything board related

	gameloader.update(); // Updates whatever game is currently loaded.

	guinavigation.updateElement_Coords(); // Update the division on the screen displaying your current coordinates
}

/** Debug toggles that are not only for in a game, but outside. */
function testOutGameDebugToggles() {
	if (guinavigation.isCoordinateActive()) return; // Don't listen for keyboard presses when the coordinate input is active

	if (input.isKeyDown('`')) camera.toggleDebug();
	if (input.isKeyDown('4')) websocket.toggleDebug(); // Adds simulated websocket latency with high ping
}

function testInGameDebugToggles(gamefile: gamefile) {
	if (guinavigation.isCoordinateActive()) return; // Don't listen for keyboard presses when the coordinate input is active

	if (input.isKeyDown('2')) {
		console.log(jsutil.deepCopyObject(gamefile));
		console.log('Estimated gamefile memory usage: ' + jsutil.estimateMemorySizeOf(gamefile));
	}
	if (input.isKeyDown('3')) animation.toggleDebug(); // Each animation slows down and renders continuous ribbon
	if (input.isKeyDown('5')) voids.toggleDebug(); // Renders the wireframe of voids
	if (input.isKeyDown('6')) copypastegame.copyGame(true); // Copies the gamefile as a single position, without all the moves.
	if (gamefile.mesh.locked && input.isKeyDown('z')) loadbalancer.setForceCalc(true);
}

function updateSelectionScreen() {
	// When we're not inside a game, the board should have a constant slow pan.
	movement.recalcPosition(); // Updates the board's position and scale according to its velocity
}

// Called within update() when we are in a game (not title screen)
function updateBoard(gamefile: gamefile) {
	if (!guinavigation.isCoordinateActive()) {
		if (input.isKeyDown('1')) options.toggleEM(); // EDIT MODE TOGGLE
		if (input.isKeyDown('escape')) guipause.toggle();
		if (input.isKeyDown('tab')) guipause.callback_ToggleArrows();
		if (input.isKeyDown('r')) piecesmodel.regenModel(gamefile, options.getPieceRegenColorArgs(), true);
		if (input.isKeyDown('n')) {
			guinavigation.toggle();
			guigameinfo.toggle();
		}
	}

	const timeWinner = clock.update(gamefile);
	if (timeWinner && !onlinegame.areInOnlineGame()) { // undefined if no clock has ran out
		gamefile.gameConclusion = `${timeWinner} time`;
		gameslot.concludeGame();
	}
	guiclock.update(gamefile);
	miniimage.testIfToggled();

	movement.updateNavControls(); // Update board dragging, and WASD to move, scroll to zoom
	movement.recalcPosition(); // Updates the board's position and scale according to its velocity
	transition.update();
	board.recalcVariables(); // Variables dependant on the board position & scale

	guinavigation.update();
	// NEEDS TO BE AFTER guinavigation.update(), because otherwise arrows.js may think we are hovering
	// over a piece from before forwarding/rewinding a move, causing a crash.
	arrows.update();
	// NEEDS TO BE AFTER arrows.update() !!! Because this modifies the arrow indicator list.
	// NEEDS TO BE BEFORE movement.checkIfBoardDragged() because that shift arrows needs to overwrite this.
	// NEEDS TO BE BEFORE selection.update() because that calls droparrows to update(), and that needs to overwrite any animation from animation.ts
	animation.update();
	selection.update(); // NEEDS TO BE AFTER animation.update() because this updates droparrows.ts and that needs to overwrite animations.
	// ALSO depends on whether or not a piece is selected/being dragged!
	// NEEDS TO BE AFTER animation.update() because shift arrows needs to overwrite that.
	movement.checkIfBoardDragged(); 
	miniimage.genModel();
	highlightline.genModel();

	if (guipause.areWePaused()) return;

	movement.dragBoard(); // Calculate new board position if it's being dragged. Needs to be after updateNavControls()
} 

function render() {
	if (gameslot.areWeLoadingGraphics()) return; // If the loading animation is visible, nothing in-game is (and the gamefile isn't defined anyway)

	board.render(); // Renders the infinite checkerboard

	const gamefile = gameslot.getGamefile();
	if (!gamefile) return; // No gamefile, on the selection menu. Only render the checkerboard and nothing else.

	input.renderMouse();

	/**
	 * What is the order or rendering?
	 * 
	 * Board tiles
	 * Highlights
	 * Pieces
	 * Arrows
	 * Crosshair
	 */

	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		highlights.render(gamefile);
		animation.renderTransparentSquares(); // Required to hide the piece currently being animated
		dragAnimation.renderTransparentSquare(); // Required to hide the piece currently being animated
	});
    
	// The rendering of the pieces needs to use the normal depth function, because the
	// rendering of currently-animated pieces needs to be blocked by animations.
	pieces.renderPiecesInGame(gamefile);
	
	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		animation.renderAnimations();
		promotionlines.render();
		selection.renderGhostPiece(); // If not after pieces.renderPiecesInGame(), wont render on top of existing pieces
		dragAnimation.renderPiece();
		arrows.render();
		perspective.renderCrosshair();
	});
}



export default {
	init,
	update,
	render,
};