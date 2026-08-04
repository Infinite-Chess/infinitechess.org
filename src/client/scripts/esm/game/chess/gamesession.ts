// src/client/scripts/esm/game/chess/gamesession.ts

/**
 * The current game session's lightweight state: what *kind* of game is loaded (local / online /
 * engine / editor), whether it's still loading, and the shared load-finish / unload lifecycle.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';

import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';

import area from '../rendering/area.js';
import toast from '../../components/toast.js';
import meshes from '../rendering/meshes.js';
import gameslot from './gameslot.js';
import boardpos from '../rendering/boardpos.js';
import gamecore from './gamecore.js';
import Transition from '../rendering/transitions/Transition.js';
import perspective from '../rendering/perspective.js';
import { GameBus } from '../GameBus.js';

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

/** Every page must establish this at entry, before the game loop starts, so it is never read un-set. */
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

/** True while the gamefile's logical, graphical (images), or engine resources are still loading. */
function isLoading(): boolean {
	return loading;
}

// Load / Unload lifecycle ------------------------------------------------------

/** Declares the kind of game session we're in. */
function setSessionGame(gameSession: GameSession): void {
	session = gameSession;
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
	GameBus.dispatch('graphical-loaded');
	GameBus.dispatch('load-ended');
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

/** Displays an error toast saying the game failed to load, and discards the failed load. */
function onCatchLoadingError(err: Error): void {
	console.error('Error loading game: ', err);
	toast.show('An error occurred while loading the game. Please refresh.', { error: true });
	// Discard the half-built game — loadLogical may have completed, leaving a gamefile the
	// graphical half never gave a mesh. Clearing the flag lets a later load replace it,
	// rather than wedging everything gated on isLoading() until a refresh.
	if (gameslot.getGamefile()) unloadGame();
	loading = false;
	// After the teardown, so anything resuming on this starts from a clean session.
	GameBus.dispatch('load-ended');
}

/**
 * Concludes the game if it's over — whether it loaded that way, or a conclusion arrived mid-load
 * (gameslot.concludeGame() defers to here while loading). Call AFTER {@link markLoadingDone}: the
 * moves list only paints its plies on 'graphical-loaded', and the result banner sits beneath them.
 */
function concludeGameIfOver(): void {
	// Suppresses the game-over sound — it didn't happen live in front of us; the board wasn't up yet.
	if (gamefileutility.isGameOver(gameslot.getGamefile()!)) gameslot.concludeGame(false);
}

/** Tears the current board down — gamefile, perspective, momentum, transitions — and hides the canvas. */
function unloadGame(): void {
	perspective.disable();
	gameslot.unloadGame();
	boardpos.eraseMomentum();
	Transition.terminate();
	gamecore.getCanvas().classList.add('visibility-hidden');
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
	unloadGame,
};
