
/**
 * This script prepares our game.
 * 
 * And contains our main update() and render() methods
 */


// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';


import gui from '../gui/gui.js';
import jsutil from '../../util/jsutil.js';
import highlights from '../rendering/highlights/highlights.js';
import gameslot from './gameslot.js';
import guinavigation from '../gui/guinavigation.js';
// @ts-ignore
import onlinegame from '../misc/onlinegame/onlinegame.js';
// @ts-ignore
import arrows from '../rendering/arrows.js';
// @ts-ignore
import pieces from '../rendering/pieces.js';
// @ts-ignore
import invites from '../misc/invites.js';
import guititle from '../gui/guititle.js';
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
import dragAnimation from '../rendering/draganimation.js';
// @ts-ignore
import piecesmodel from '../rendering/piecesmodel.js';
// @ts-ignore
import loadbalancer from '../misc/loadbalancer.js';
// @ts-ignore
import camera from '../rendering/camera.js';
// @ts-ignore
import guigameinfo from '../gui/guigameinfo.js';
import gameloader from './gameloader.js';


// Functions -------------------------------------------------------------------------------


function init() {
	options.initTheme();

	gui.prepareForOpen();

	guititle.open();

	board.recalcTileWidth_Pixels(); // Without this, the first touch tile is NaN
}

// Update the game every single frame
function update() {
	invites.update();
	if (gameslot.areWeLoadingGraphics()) return; // If the graphics aren't finished loading, nothing is visible, only the loading animation.

	const gamefile = gameslot.getGamefile();
	if (!gamefile) return updateSelectionScreen(); // On title screen

	// There is a gamefile, update everything board-related...

	if (!guinavigation.isCoordinateActive()) {
		if (input.isKeyDown('`')) options.toggleDeveloperMode();
		if (input.isKeyDown('2')) {
			console.log(jsutil.deepCopyObject(gamefile));
			console.log('Estimated gamefile memory usage: ' + jsutil.estimateMemorySizeOf(gamefile));
		}
		if (input.isKeyDown('m')) options.toggleFPS();
		if (gamefile.mesh.locked && input.isKeyDown('z')) loadbalancer.setForceCalc(true);
	}

	updateBoard(gamefile); // Other screen, board is visible, update everything board related

	gameloader.update(); // Updates whatever game is currently loaded.

	guinavigation.updateElement_Coords(); // Update the division on the screen displaying your current coordinates
}

function updateSelectionScreen() {
	// When we're not inside a game, the board should have a constant slow pan.
	// movement.panBoard(); // Animate background if not afk
	movement.recalcPosition(); // Updates the board's position and scale according to its velocity
}

// Called within update() when we are in a game (not title screen)
function updateBoard(gamefile: gamefile) {
	if (!guinavigation.isCoordinateActive()) {
		if (input.isKeyDown('1')) options.toggleEM(); // EDIT MODE TOGGLE
		if (input.isKeyDown('escape')) guipause.toggle();
		if (input.isKeyDown('tab')) guipause.callback_TogglePointers();
		if (input.isKeyDown('r')) piecesmodel.regenModel(gamefile, options.getPieceRegenColorArgs(), true);
		if (input.isKeyDown('n')) {
			guinavigation.toggle();
			guigameinfo.toggle();
			camera.updatePIXEL_HEIGHT_OF_NAVS();
		}
	}

	const timeWinner = clock.update(gamefile);
	if (timeWinner && !onlinegame.areInOnlineGame()) { // undefined if no clock has ran out
		gamefile.gameConclusion = `${timeWinner} time`;
		gameslot.concludeGame();
	}
	guiclock.update(gamefile);
	miniimage.testIfToggled();
	animation.update();

	movement.updateNavControls(); // Update board dragging, and WASD to move, scroll to zoom
	movement.recalcPosition(); // Updates the board's position and scale according to its velocity
	transition.update();
	board.recalcVariables(); // Variables dependant on the board position & scale

	guinavigation.update();
	selection.update();
	arrows.update(); // NEEDS TO BE AFTER selection.update(), because the arrows model regeneration DEPENDS on the piece selected!
	movement.checkIfBoardDragged(); // ALSO depends on whether or not a piece is selected/being dragged!
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
		animation.renderPieces();
		promotionlines.render();
		selection.renderGhostPiece(); // If not after pieces.renderPiecesInGame(), wont render on top of existing pieces
		dragAnimation.renderPiece();
		arrows.renderThem();
		perspective.renderCrosshair();
	});
}



export default {
	init,
	update,
	render,
};