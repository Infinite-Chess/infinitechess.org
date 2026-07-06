// src/client/scripts/esm/game/chess/gamesession.ts

/**
 * The current game session's lightweight state: what *kind* of game is loaded (local / online /
 * engine / editor), whether it's still loading, and the shared load-finish / unload lifecycle.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';

import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';

import area from '../rendering/area.js';
import meshes from '../rendering/meshes.js';
import gameslot from './gameslot.js';
import boardpos from '../rendering/boardpos.js';
import gamecore from './gamecore.js';
import Transition from '../rendering/transitions/Transition.js';
import perspective from '../rendering/perspective.js';

// Types ------------------------------------------------------------------------

/** The type of game session we're in, and our role in it, if applicable. */
type GameSession =
	| {
			/** The type of game we are in */
			type: 'online';
			/** Our role in the game. Undefined if we're not a participant (spectator). */
			role?: Player;
	  }
	| {
			/** The type of game we are in */
			type: 'engine';
			/** Our role in the game. */
			role: Player;
	  }
	| { type: 'analysis' | 'editor' };

// Variables --------------------------------------------------------------------

let session: GameSession;

/** True while the gamefile's logical, graphical (images), or engine resources are currently loading. */
let loading: boolean = false;

// Getters / Setters ------------------------------------------------------------

/** Returns the type of game we are in. */
function getGameType(): GameSession['type'] {
	return session.type;
}

/** Returns our role in the game, if a participant, in either an online/engine game. */
function getRole(): Player | undefined {
	if (session.type === 'online' || session.type === 'engine') return session.role;
	throw Error("Can't get our color in this type of game: " + session.type);
}

/** Returns whether we are allowed to physically move a piece, according to our role. */
function isItOurTurn(): boolean {
	switch (session.type) {
		case 'online':
			return gameslot.getGamefile()!.whosTurn === session.role;
		case 'engine':
			return gameslot.getGamefile()!.whosTurn === session.role;
		case 'editor':
		case 'analysis':
			return true;
	}
}

/** True while the gamefile's graphical (images) or engine resources are still loading. */
function isLoading(): boolean {
	return loading;
}

// Load / Unload lifecycle ------------------------------------------------------

/** Sets the type of game we're in, and marks it as loading. */
function setSessionGame(gameSession: GameSession): void {
	session = gameSession;
	markLoading();
}

/** Flags the game's graphics/engine as newly loading. */
function markLoading(): void {
	// console.log('START loading.');
	loading = true;
	gamecore.getCanvas().classList.add('visibility-hidden');
}

/**
 * Run once a game is FULLY loaded (graphical, spritesheet, engine, etc.):
 * clears the loading flag, plays the opening zoom-in.
 */
function markLoadingDone(): void {
	// console.log('Game fully loaded.');
	loading = false;
	gamecore.getCanvas().classList.remove('visibility-hidden'); // Show the canvas now that the game is fully loaded.
	centerView();
}

/** Sets the camera to the recentered position. */
function centerView(): void {
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(
		gameslot.getGamefile()!.startSnapshot.box,
	);
	const centerArea = area.calculateFromUnpaddedBox(boxFloating);
	boardpos.setBoardPos(centerArea.coords);
	boardpos.setBoardScale(centerArea.scale);
}

/** Logs a fatal error encountered while loading a game. */
function onCatchLoadingError(err: Error): void {
	console.error(err);
	// TODO: Implement user-facing error
}

/** Concludes the game if it loaded already over. Call after the logical gamefile is fully loaded. */
function concludeGameIfOver(): void {
	if (gamefileutility.isGameOver(gameslot.getGamefile()!)) gameslot.concludeGame();
}

function unloadLogicalAndRendering(): void {
	gameslot.unloadGame();
	perspective.disable();
	boardpos.eraseMomentum();
	Transition.terminate();
}

function unloadGame(): void {
	unloadLogicalAndRendering();
}

// Exports --------------------------------------------------------------------

export default {
	getGameType,
	getRole,
	isItOurTurn,
	isLoading,
	setSessionGame,
	markLoading,
	markLoadingDone,
	onCatchLoadingError,
	concludeGameIfOver,
	unloadLogicalAndRendering,
	unloadGame,
};
