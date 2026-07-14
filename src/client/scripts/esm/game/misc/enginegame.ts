// src/client/scripts/esm/game/misc/enginegame.ts

// This module keeps track of the data of the engine game we are currently in.

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import movevalidation from '../../../../../shared/chess/logic/movevalidation.js';
import typeutil, { players as p } from '../../../../../shared/chess/util/typeutil.js';

import toast from '../../components/toast.js';
import gameslot from '../chess/gameslot.js';
import premoves from '../chess/premoves.js';
import selection from '../chess/selection.js';
import { GameBus } from '../GameBus.js';
import gamesession from '../chess/gamesession.js';
import movesequence from '../chess/movesequence.js';
import gamecompressor from '../chess/gamecompressor.js';
import checkmatepractice from '../chess/checkmatepractice.js';
import enginelegalmovesdebug from './enginelegalmovesdebug.js';

// Types ------------------------------------------------------------------------

interface EngineConfig {
	/** Hard time limit for the engine to think in milliseconds */
	engineTimeLimitPerMoveMillis: number;
	// If you are using a checkmate practice engine, this is required.
	checkmateSelectedID?: string;
	strengthLevel?: number;
	multiPv?: number;
}

// Variables --------------------------------------------------------------------

/** Whether we are currently in an engine game. */
let inEngineGame: boolean = false;
let engineColor: Player | undefined;
let currentEngine: string | undefined; // name of the current engine used
let engineConfig: EngineConfig | undefined; // json that is sent to the engine, giving it extra config information
let engineWorker: Worker | undefined;

// Events -----------------------------------------------------------------------

GameBus.addEventListener('user-move-played', () => onMovePlayed());
GameBus.addEventListener('game-concluded', () => {
	if (!inEngineGame) return;
	checkmatepractice.onEngineGameConclude();
});

enginelegalmovesdebug.init({
	canRequest: () => inEngineGame && engineWorker !== undefined,
	requestMoves: ({ gamefile }) => requestGeneratedMoves(gamefile),
});

// Functions ------------------------------------------------------------------------

/**
 * Inits an engine game. In particular, it needs gameOptions in order to know what engine to use for this enginegame.
 * This method launches an engine webworker for the current game.
 * @param options - An object that contains the properties `currentEngine` and `engineConfig`
 */
function initEngineGame(options: {
	youAreColor: Player;
	currentEngine: string;
	engineConfig: EngineConfig;
}): Promise<void> {
	console.log(`Starting engine game with engine "${options.currentEngine}".`);

	inEngineGame = true;
	engineColor = typeutil.invertPlayer(options.youAreColor);
	currentEngine = options.currentEngine;
	engineConfig = options.engineConfig;

	// Initialize the engine as a webworker
	if (!window.Worker) {
		alert("Your browser doesn't support web workers. Cannot play against an engine.");
		// Reject the promise returned by this function
		return Promise.reject(
			new Error("Cannot finish loading engine game because web workers aren't supported."),
		);
	}
	engineWorker = new Worker(`../scripts/esm/game/chess/engines/${currentEngine}.js`, {
		type: 'module',
	}); // module type allows the web worker to import methods and types from other scripts.

	// Return a promise that resolves when the ENGINE WORKER has finished fetching/loading.
	return new Promise<void>((resolve, reject): void => {
		// Set up a handler for the 'isready' command that indicates the worker is loaded and ready
		// We have to manually send this message at the top of our engines.
		engineWorker!.onmessage = (e: MessageEvent): void => {
			if (e.data === 'readyok') {
				resolve(); // Engine is ready!
				onMovePlayed(); // Without this, the engine won't start calculating moves if it's first to move.
			}
		};
		engineWorker!.onerror = (e: ErrorEvent): void => {
			reject(new Error('Worker failed to load: ' + e.message));
		};
	}).then((_result: any) => {
		// After the promise resolves, we know the worker is ready
		// Overwrite the onmessage listener to listen for move submissions
		engineWorker!.onmessage = (e: MessageEvent): void => handleEngineMessage(e.data);
		// Remove the error handler (no longer needed after worker is ready)
		engineWorker!.onerror = null;
		// Ensures if the debug mode was on before starting an engine game,
		// the engine generated legal moves are rendered as soon as the engine is ready.
		enginelegalmovesdebug.requestMovesForCurrentPosition();
	});
}

/**
 * This method is called externally when the player submits his move in an engine game
 * It submits the gamefile to the webworker
 */
function onMovePlayed(): void {
	if (!inEngineGame) return; // Don't do anything if it's not an engine game
	const gamefile = gameslot.getGamefile()!;
	// Make sure it's the engine's turn
	if (gamefile.whosTurn !== engineColor) return; // Don't do anything if it's our turn (not the engines)
	checkmatepractice.registerHumanMove(); // inform the checkmatepractice script that the human player has made a move
	if (gamefile.gameConclusion) return; // Don't do anything if the game is over

	// Request the engine to perform a best move calculation...

	const longformIn = gamecompressor.compressGamefile(gamefile); // Compress the gamefile to send to the engine in a simpler json format
	// Send the gamefile to the engine web worker
	/** This has all nested functions removed. */
	const stringGamefile = JSON.stringify(gamefile, jsutil.stringifyReplacer);

	// Derive clock times for both colors in milliseconds, similar to UCI wtime/btime/winc/binc
	let wtime: number | undefined;
	let btime: number | undefined;
	let winc: number | undefined;
	let binc: number | undefined;
	const basegame = gamefile;
	const clocks = basegame.clocks;
	if (!basegame.untimed && clocks) {
		wtime = clocks.currentTime[p.WHITE];
		btime = clocks.currentTime[p.BLACK];
		const incSeconds = clocks.startTime.increment;
		winc = incSeconds * 1000;
		binc = incSeconds * 1000;
	}

	// prettier-ignore
	const timing = wtime !== undefined && btime !== undefined ? {
		wtime,
		btime,
		winc,
		binc,
	} : undefined;

	if (engineWorker)
		engineWorker.postMessage({
			stringGamefile,
			lf: longformIn,
			engineConfig: engineConfig,
			youAreColor: engineColor,
			wtime: timing?.wtime,
			btime: timing?.btime,
			winc: timing?.winc,
			binc: timing?.binc,
		});
	else console.error('User made a move in an engine game but no engine webworker is loaded!');
}

function handleEngineMessage(data: any): void {
	// console.log('Received message from engine worker:', data);

	if (typeof data !== 'object' || data === null) {
		console.error('Received invalid message from engine worker:', data);
		return;
	}

	// Check if the message contains generated moves for debugging
	if (data.type === 'move') {
		// Message contains the engine's best move suggestion
		makeEngineMove(data.data);
	} else if (data.type === 'generatedMoves') {
		enginelegalmovesdebug.receiveMovesForOldestRequest([...data.data]);
	} else {
		console.error('Received unknown message from engine worker:', data);
	}
}

/**
 * This method takes care of all the logic involved in making an engine move
 * It gets called after the engine finishes its calculation
 * @param move - The move that SHOULD be a string in compact format "x,y>x,y=P"
 */
function makeEngineMove(tokenMove: unknown): void {
	if (!inEngineGame) return;
	if (!currentEngine)
		return console.error('Attempting to make engine move, but no engine loaded!');

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	if (tokenMove === null) {
		// Null can mean the engine didn't return a best move (perhaps it didn't
		// find any legal moves, or thought it was checkmate), or an error occurred.
		// In this case, resign for the engine.
		console.log(`Engine returned a null move. Resigning the game...`);
		gamefile.gameConclusion = { condition: 'resignation', victor: gamesession.getRole()! };
		gameslot.concludeGame();
		return;
	}

	premoves.performWithUnapplied(gamefile, mesh, () => {
		const moveValidationResults = movevalidation.isTokenMoveLegal(gamefile, tokenMove);

		if (!moveValidationResults.valid) {
			toast.show(
				`Engine submitted an illegal move. Please report this bug! Move "${tokenMove}" is illegal for reason: ${moveValidationResults.reason}`,
				{ error: true, durationMultiplier: 100 },
			);
			return false; // Don't physically play next premove
		}

		if (moveutil.areWeViewingLatestMove(gamefile)) {
			// Normal case: play and animate the move.
			movesequence.makeMoveAndAnimate(gamefile, mesh, moveValidationResults.tagged);
		} else {
			// We're reviewing a past move. Silently append it, staying on our current view.
			movesequence.makeMoveKeepingView(gamefile, mesh, moveValidationResults.tagged);
		}

		checkmatepractice.registerEngineMove(); // inform the checkmatepractice script that the engine has made a move

		return true; // Good to physically play next premove
	});

	selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.
}

/** Requests engine-generated legal moves for the currently viewed position. */
function requestGeneratedMoves(gamefile: GameFile): void {
	// Compress the gamefile as a single position (not including future moves)
	// This ensures the engine analyzes the currently viewed position
	const longformIn = gamecompressor.compressGamefile(gamefile, true);
	const stringGamefile = JSON.stringify(gamefile, jsutil.stringifyReplacer);

	if (engineWorker)
		engineWorker.postMessage({
			stringGamefile,
			lf: longformIn,
			engineConfig: engineConfig,
			youAreColor: engineColor,
			requestGeneratedMoves: true,
		});
}

// Export ---------------------------------------------------------------------------------

export default {
	initEngineGame,
	onMovePlayed,
};

export type { EngineConfig };
