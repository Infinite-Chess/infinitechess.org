
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
import droparrows from '../rendering/dragging/droparrows.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import arrows from '../rendering/arrows/arrows.js';
import clock from '../../chess/logic/clock.js';
import guigameinfo from '../gui/guigameinfo.js';
import animation from '../rendering/animation.js';
import draganimation from '../rendering/dragging/draganimation.js';
import selection from './selection.js';
import arrowlegalmovehighlights from '../rendering/arrows/arrowlegalmovehighlights.js';
import specialrighthighlights from '../rendering/highlights/specialrighthighlights.js';
import piecemodels from '../rendering/piecemodels.js';
import { CreateInputListener, InputListener, Mouse } from '../input2.js';
// @ts-ignore
import invites from '../misc/invites.js';
// @ts-ignore
import guipause from '../gui/guipause.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import miniimage from '../rendering/miniimage.js';
// @ts-ignore
import guiclock from '../gui/guiclock.js';
// @ts-ignore
import movement from '../rendering/movement.js';
// @ts-ignore
import board from '../rendering/board.js';
// @ts-ignore
import webgl from '../rendering/webgl.js';
// @ts-ignore
import perspective from '../rendering/perspective.js';
// @ts-ignore
import highlightline from '../rendering/highlights/highlightline.js';
// @ts-ignore
import transition from '../rendering/transition.js';
// @ts-ignore
import promotionlines from '../rendering/promotionlines.js';
// @ts-ignore
import websocket from '../websocket.js';
// @ts-ignore
import camera from '../rendering/camera.js';
// @ts-ignore
import copypastegame from './copypastegame.js';
// @ts-ignore
import stats from '../gui/stats.js';
// @ts-ignore
import statustext from '../gui/statustext.js';

// Functions -------------------------------------------------------------------------------

const element_overlay: HTMLElement = document.getElementById('overlay')!;
let listener: InputListener;

function init() {
	board.updateTheme();
	board.recalcVariables(); // Variables dependant on the board position & scale

	gui.prepareForOpen();

	guititle.open();

	board.recalcTileWidth_Pixels(); // Without this, the first touch tile is NaN

	listener = CreateInputListener(element_overlay);
}

// Update the game every single frame
function update() {
	testOutGameDebugToggles();
	invites.update();
	if (gameloader.areWeLoadingGame()) return; // If the game isn't totally finished loading, nothing is visible, only the loading animation.

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
	if (listener.isKeyDown('`')) camera.toggleDebug();
	if (listener.isKeyDown('4')) websocket.toggleDebug(); // Adds simulated websocket latency with high ping
	if (listener.isKeyDown('m')) stats.toggleFPS();
}

function testInGameDebugToggles(gamefile: gamefile) {
	if (listener.isKeyDown('2')) {
		console.log(jsutil.deepCopyObject(gamefile));
		console.log('Estimated gamefile memory usage: ' + jsutil.estimateMemorySizeOf(gamefile));
	}
	if (listener.isKeyDown('3')) animation.toggleDebug(); // Each animation slows down and renders continuous ribbon
	if (listener.isKeyDown('5')) copypastegame.copyGame(true); // Copies the gamefile as a single position, without all the moves.
	if (listener.isKeyDown('6')) specialrighthighlights.toggle(); // Highlights special rights and en passant
}

function updateSelectionScreen() {
	// When we're not inside a game, the board should have a constant slow pan.
	movement.recalcPosition(); // Updates the board's position and scale according to its velocity
}

// Called within update() when we are in a game (not title screen)
function updateBoard(gamefile: gamefile) {
	if (listener.isKeyDown('1')) selection.toggleEditMode(); // EDIT MODE TOGGLE
	if (listener.isKeyDown('escape')) guipause.toggle();
	if (listener.isKeyDown('tab')) guipause.callback_ToggleArrows();
	if (listener.isKeyDown('r')) {
		piecemodels.regenAll(gamefile);
		statustext.showStatus('Regenerated piece models.', false, 0.5);
	}
	if (listener.isKeyDown('n')) {
		guinavigation.toggle();
		guigameinfo.toggle();
	}

	const timeWinner = clock.update(gamefile);
	if (timeWinner && !onlinegame.areInOnlineGame()) { // undefined if no clock has ran out
		gamefile.gameConclusion = `${timeWinner} time`;
		gameslot.concludeGame();
	}
	guiclock.update(gamefile);
	miniimage.testIfToggled();

	guinavigation.update();
	selection.update(); // NEEDS TO BE AFTER animation.update() because this updates droparrows.ts and that needs to overwrite animations.
	// NEEDS TO BE AFTER guinavigation.update(), because otherwise arrows.js may think we are hovering
	// over a piece from before forwarding/rewinding a move, causing a crash.
	arrows.update();
	// NEEDS TO BE AFTER arrows.update() !!! Because this modifies the arrow indicator list.
	// NEEDS TO BE BEFORE movement.checkIfBoardDragged() because that shift arrows needs to overwrite this.
	animation.update();
	draganimation.updateDragLocation(); // BEFORE droparrows.shiftArrows() so that can overwrite this.
	droparrows.shiftArrows(); // Shift the arrows of the dragged piece AFTER selection.update() makes any moves made!

	arrows.executeArrowShifts(); // Execute any arrow modifications made by animation.js or arrowsdrop.js. Before arrowlegalmovehighlights.update(), dragBoard()
	arrowlegalmovehighlights.update(); // After executeArrowShifts()

	movement.updateNavControls(); // Update board dragging, and WASD to move, scroll to zoom
	movement.recalcPosition(); // Updates the board's position and scale according to its velocity
	transition.update();

	movement.dragBoard(); // Calculate new board position if it's being dragged. After updateNavControls(), executeArrowShifts()

	board.recalcVariables(); // Variables dependant on the board position & scale   AFTER movement.dragBoard() or picking up the board has a spring back effect to it

	// NEEDS TO BE BEFORE checkIfBoardDragged(), because clicks should prioritize teleporting to miniimages over dragging the board!
	// AFTER: movement.dragBoard(), because whether the miniimage are visible or not depends on our updated board position and scale.
	miniimage.genModel();
	highlightline.genModel(); // Before movement.checkIfBoardDragged() since clicks should prioritize this.
	// AFTER: selection.update(), animation.update() because shift arrows needs to overwrite that.
	// After miniimage.genModel() and highlightline.genModel() because clicks prioritize those.
	movement.checkIfBoardDragged();
} 

function render() {
	if (gameloader.areWeLoadingGame()) return; // If the game isn't totally finished loading, nothing is visible, only the loading animation.

	board.render(); // Renders the infinite checkerboard

	const gamefile = gameslot.getGamefile();
	if (!gamefile) return; // No gamefile, on the selection menu. Only render the checkerboard and nothing else.

	input.renderMouse();

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
		highlights.render(gamefile);
		animation.renderTransparentSquares(); // Required to hide the piece currently being animated
		draganimation.renderTransparentSquare(); // Required to hide the piece currently being animated
	});
    
	// The rendering of the pieces needs to use the normal depth function, because the
	// rendering of currently-animated pieces needs to be blocked by animations.
	pieces.renderPiecesInGame(gamefile);
	
	// Using depth function "ALWAYS" means we don't have to render with a tiny z offset
	webgl.executeWithDepthFunc_ALWAYS(() => {
		animation.renderAnimations();
		promotionlines.render();
		selection.renderGhostPiece(); // If not after pieces.renderPiecesInGame(), wont render on top of existing pieces
		draganimation.renderPiece();
		arrows.render();
		perspective.renderCrosshair();
	});
}



export default {
	init,
	update,
	render,
};

export { listener }; // Export the listener so that other modules can use it.