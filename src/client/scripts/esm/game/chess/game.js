
// Import Start
import onlinegame from '../misc/onlinegame.js';
import gui from '../gui/gui.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import arrows from '../rendering/arrows.js';
import guipromotion from '../gui/guipromotion.js';
import guinavigation from '../gui/guinavigation.js';
import pieces from '../rendering/pieces.js';
import invites from '../misc/invites.js';
import guititle from '../gui/guititle.js';
import guipause from '../gui/guipause.js';
import input from '../input.js';
import miniimage from '../rendering/miniimage.js';
import clock from '../../chess/logic/clock.js';
import guiclock from '../gui/guiclock.js';
import piecesmodel from '../rendering/piecesmodel.js';
import movement from '../rendering/movement.js';
import selection from './selection.js';
import camera from '../rendering/camera.js';
import board from '../rendering/board.js';
import moveutil from '../../chess/util/moveutil.js';
import animation from '../rendering/animation.js';
import webgl from '../rendering/webgl.js';
import { gl } from '../rendering/webgl.js';
import perspective from '../rendering/perspective.js';
import highlightline from '../rendering/highlightline.js';
import transition from '../rendering/transition.js';
import wincondition from '../../chess/logic/wincondition.js';
import options from '../rendering/options.js';
import copypastegame from './copypastegame.js';
import highlights from '../rendering/highlights.js';
import promotionlines from '../rendering/promotionlines.js';
import guigameinfo from '../gui/guigameinfo.js';
import loadbalancer from '../misc/loadbalancer.js';
import gamerules from '../../chess/variants/gamerules.js';
import jsutil from '../../util/jsutil.js';
import winconutil from '../../chess/util/winconutil.js';
import sound from '../misc/sound.js';
import spritesheet from '../rendering/spritesheet.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 */

"use strict";

/**
 * This script stores our currently loaded game,
 * and holds our update and render methods.
 */

/**
 * The currently loaded game. 
 * @type {gamefile}
 */
let gamefile;

/**
 * Returns the gamefile currently loaded
 * @returns {gamefile} The current gamefile
 */
function getGamefile() {
	return gamefile;
}

function areInGame() {
	return gamefile !== undefined;
}

// Initiates textures, buffer models for rendering, and the title screen.
function init() {

	options.initTheme();
	spritesheet.initSpritesheet(gl);

	guititle.open();

	board.recalcTileWidth_Pixels(); // Without this, the first touch tile is NaN
}

function updateVariablesAfterScreenResize() {
	// Recalculate scale at which 1 tile = 1 pixel       world-space                physical pixels
	movement.setScale_When1TileIs1Pixel_Physical((camera.getScreenBoundingBox(false).right * 2) / camera.canvas.width);
	movement.setScale_When1TileIs1Pixel_Virtual(movement.getScale_When1TileIs1Pixel_Physical() * camera.getPixelDensity());
	// console.log(`Screen width: ${camera.getScreenBoundingBox(false).right * 2}. Canvas width: ${camera.canvas.width}`)
}

// Update the game every single frame
function update() {
	if (!guinavigation.isCoordinateActive()) {
		if (input.isKeyDown('`')) options.toggleDeveloperMode();
		if (input.isKeyDown('2')) console.log(jsutil.deepCopyObject(gamefile));
		if (input.isKeyDown('m')) options.toggleFPS();
		if (gamefile?.mesh.locked && input.isKeyDown('z')) loadbalancer.setForceCalc(true);
	}

	if (gui.getScreen().includes('title')) updateTitleScreen();
	else updateBoard(); // Other screen, board is visible, update everything board related

	onlinegame.update();

	guinavigation.updateElement_Coords(); // Update the division on the screen displaying your current coordinates
	// options.update();
}

// Called within update() when on title screen
function updateTitleScreen() {
	movement.panBoard(); // Animate background if not afk

	invites.update();
}

// Called within update() when we are in a game (not title screen)
function updateBoard() {
	if (!guinavigation.isCoordinateActive()) {
		if (input.isKeyDown('1')) options.toggleEM(); // EDIT MODE TOGGLE
		if (input.isKeyDown('escape')) guipause.toggle();
		if (input.isKeyDown('tab')) guipause.callback_TogglePointers();
		if (input.isKeyDown('r')) piecesmodel.regenModel(gamefile, options.getPieceRegenColorArgs(), true);
		if (input.isKeyDown('n')) options.toggleNavigationBar();
	}

	const timeWinner = clock.update(gamefile);
	if (timeWinner) { // undefined if no clock has ran out
		gamefile.gameConclusion = `${timeWinner} time`;
		concludeGame();
	}
	guiclock.update(gamefile);
	miniimage.testIfToggled();
	animation.update();
	if (guipause.areWePaused() && !onlinegame.areInOnlineGame()) return;

	movement.recalcPosition();
	transition.update();
	board.recalcVariables(); 
	guinavigation.update();
	arrows.update();
	selection.update(); // Test if a piece was clicked on or moved. Needs to be before updateNavControls()
	// We NEED THIS HERE as well as in gameLoop.render() so the game can detect mouse clicks
	// on the miniimages in perspective mode even when the screen isn't being rendered!
	miniimage.genModel();
	highlightline.genModel();
	movement.updateNavControls(); // Navigation controls

	if (guipause.areWePaused()) return;

	movement.dragBoard(); // Calculate new board position if it's being dragged. Needs to be after updateNavControls()
} 

function render() {
    
	board.render();
	renderEverythingInGame();
}

function renderEverythingInGame() {
	if (gui.getScreen().includes('title')) return;

	input.renderMouse();

	webgl.executeWithDepthFunc_ALWAYS(() => {
		highlights.render(); // Needs to be before and underneath the pieces
		highlightline.render();
	});
    
	animation.renderTransparentSquares();
	pieces.renderPiecesInGame(gamefile);
	animation.renderPieces();
    
	webgl.executeWithDepthFunc_ALWAYS(() => {
		promotionlines.render();
		selection.renderGhostPiece(); // If not after pieces.renderPiecesInGame(), wont render on top of existing pieces
		arrows.renderThem();
		perspective.renderCrosshair();
	});
}

/**
 * Loads the provided gamefile onto the board.
 * Inits the promotion UI, mesh of all the pieces, and toggles miniimage rendering. (everything visual)
 * @param {gamefile} newGamefile - The gamefile
 */
function loadGamefile(newGamefile) {
	if (gamefile) return console.error("Must unloadGame() before loading a new one!");

	gamefile = newGamefile;

	// Disable miniimages and arrows if there's over 50K pieces. They render too slow.
	if (newGamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) {
		miniimage.disable();
		arrows.setMode(0); // Disables arrows
		// Checkmate is swapped out for royalcapture further down
	} else miniimage.enable();

	// Do we need to convert any checkmate win conditions to royalcapture?
	if (!wincondition.isCheckmateCompatibleWithGame(gamefile)) gamerules.swapCheckmateForRoyalCapture(gamefile.gameRules);

	guipromotion.initUI(gamefile.gameRules.promotionsAllowed);

	// Regenerate the mesh of all the pieces.
	piecesmodel.regenModel(gamefile, options.getPieceRegenColorArgs());

	guinavigation.update_MoveButtons();

	guigameinfo.updateWhosTurn(gamefile);
	// Immediately conclude the game if we loaded a game that's over already
	if (gamefileutility.isGameOver(gamefile)) {
		concludeGame();
		onlinegame.requestRemovalFromPlayersInActiveGames();
	}

	initListeners();

	guiclock.set(newGamefile);
}

/** The canvas will no longer render the current game */
function unloadGame() {
	// Terminate the mesh algorithm.
	gamefile.mesh.terminateIfGenerating();
	gamefile = undefined;

	selection.unselectPiece();
	transition.eraseTelHist();
	board.updateTheme(); // Resets the board color (the color changes when checkmate happens)
	closeListeners();

	// Clock data is unloaded with gamefile now, just need to reset gui. Not our problem ¯\_(ツ)_/¯
	guiclock.resetClocks();
}

/** Called when a game is loaded, loads the event listeners for when we are in a game. */
function initListeners() {
	document.addEventListener('copy', copypastegame.callbackCopy);
	document.addEventListener('paste', copypastegame.callbackPaste);
}

/** Called when a game is unloaded, closes the event listeners for being in a game. */
function closeListeners() {
	document.removeEventListener('copy', copypastegame.callbackCopy);
	document.removeEventListener('paste', copypastegame.callbackPaste);
}

/**
 * Ends the game. Call this when the game is over by the used win condition.
 * Stops the clocks, darkens the board, displays who won, plays a sound effect.
 */
function concludeGame() {
	if (winconutil.isGameConclusionDecisive(gamefile.gameConclusion)) moveutil.flagLastMoveAsMate(gamefile);
	clock.endGame(gamefile);
	guiclock.stopClocks(gamefile);
	board.darkenColor();
	guigameinfo.gameEnd(gamefile.gameConclusion);
	onlinegame.onGameConclude();

	const delayToPlayConcludeSoundSecs = 0.65;
	if (!onlinegame.areInOnlineGame()) {
		if (!gamefile.gameConclusion.includes('draw')) sound.playSound_win(delayToPlayConcludeSoundSecs);
		else sound.playSound_draw(delayToPlayConcludeSoundSecs);
	} else { // In online game
		if (gamefile.gameConclusion.includes(onlinegame.getOurColor())) sound.playSound_win(delayToPlayConcludeSoundSecs);
		else if (gamefile.gameConclusion.includes('draw') || gamefile.gameConclusion.includes('aborted')) sound.playSound_draw(delayToPlayConcludeSoundSecs);
		else sound.playSound_loss(delayToPlayConcludeSoundSecs);
	}
	
	// Set the Result and Condition metadata
	gamefileutility.setTerminationMetadata(gamefile);

	selection.unselectPiece();
	guipause.updateTextOfMainMenuButton();
}


export default {
	getGamefile,
	areInGame,
	init,
	updateVariablesAfterScreenResize,
	update,
	render,
	loadGamefile,
	unloadGame,
	concludeGame,
};