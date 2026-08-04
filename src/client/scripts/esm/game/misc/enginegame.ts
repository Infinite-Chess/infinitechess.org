// src/client/scripts/esm/game/misc/enginegame.ts

// This module keeps track of the data of the engine game we are currently in.

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { ValidEngine } from '../../../../../shared/chess/engine.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import movevalidation from '../../../../../shared/chess/logic/movevalidation.js';
import { engineDictionary } from '../../../../../shared/chess/engine.js';
import typeutil, { players as p } from '../../../../../shared/chess/util/typeutil.js';

import toast from '../../components/toast.js';
import gameslot from '../chess/gameslot.js';
import premoves from '../chess/premoves.js';
import selection from '../chess/selection.js';
import { GameBus } from '../GameBus.js';
import gamesession from '../chess/gamesession.js';
import movesequence from '../chess/movesequence.js';
import gamecompressor from '../chess/gamecompressor.js';
import socketmessages from '../../websocket/socketmessages.js';
import enginelegalmovesdebug from './enginelegalmovesdebug.js';
import { maxEngineThreads, THREAD_CAP } from '../chess/engines/enginewasm.js';

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

let engineColor: Player | undefined;
let engineConfig: EngineConfig | undefined; // json that is sent to the engine, giving it extra config information
/**
 * The engine worker of the game we're in, if any. `ready` flips true on its
 * 'readyok' message; until then it answers nothing.
 */
let engine: { worker: Worker; ready: boolean } | undefined;

// Events -----------------------------------------------------------------------

GameBus.addEventListener('user-move-played', () => onMovePlayed());
GameBus.addEventListener('game-concluded', () => terminate());
GameBus.addEventListener('game-unloaded', () => terminate());

// Functions ------------------------------------------------------------------------

/**
 * Inits an engine game. In particular, it needs gameOptions in order to know what engine to use for this enginegame.
 * This method launches an engine webworker for the current game.
 * Deliberately not awaitable: the board never waits on the engine. Once the worker is ready it
 * requests a move itself, catching any played while it loaded.
 * @param options - An object that contains the properties `currentEngine` and `engineConfig`
 */
function initEngineGame(options: {
	youAreColor: Player;
	currentEngine: ValidEngine;
	engineConfig: EngineConfig;
	/** Hashed URL of the engine's worker script. */
	workerUrl: string;
	/**
	 * Served engine-glue URL (`manifest['engine']`) for wasm-engine workers that load it at
	 * runtime (apeiron). Sent to the worker as an init message, with the thread count.
	 */
	engineUrl: string;
}): void {
	console.log(`Starting engine game with engine "${options.currentEngine}".`);

	engineColor = typeutil.invertPlayer(options.youAreColor);
	engineConfig = options.engineConfig;

	// Initialize the engine as a webworker
	if (!window.Worker) {
		return failEngineLoad(new Error("Cannot finish loading engine game because web workers aren't supported.")); // prettier-ignore
	}

	const worker = new Worker(options.workerUrl, {
		type: 'module',
	}); // module type allows the web worker to import methods and types from other scripts.
	engine = { worker, ready: false };

	// Installed per engine game, so the debug toggle stays inert where no engine
	// is loaded (spectators). Requests wait for 'readyok'; onEngineReady() then fires them.
	enginelegalmovesdebug.init({
		canRequest: () => engine?.ready === true,
		requestMoves: ({ gamefile }) => requestGeneratedMoves(gamefile),
	});

	// Set up a handler for the 'isready' command that indicates the worker is loaded and ready
	// We have to manually send this message at the top of our engines.
	worker.onmessage = (e: MessageEvent): void => {
		if (e.data === 'readyok') onEngineReady();
		else if (e.data?.type === 'initerror') {
			const message = String(e.data.message ?? 'Unknown initialization error.');
			failEngineLoad(new Error(`Engine failed to initialize: ${message}`));
		}
	};
	worker.onerror = (e: ErrorEvent): void => {
		failEngineLoad(new Error('Worker failed to load: ' + e.message));
	};
	if (engineDictionary[options.currentEngine].loadsWasmGlueAtRuntime)
		worker.postMessage({
			engineUrl: options.engineUrl,
			threads: getEngineThreadCount(),
		});
}

/** Opens the engine for business once its worker signals it has finished fetching/loading. */
function onEngineReady(): void {
	if (!engine) return; // A straggling 'readyok' from a worker terminated mid-load — the game ended.
	engine.ready = true;
	// Overwrite the onmessage listener to listen for move submissions
	engine.worker.onmessage = (e: MessageEvent): void => handleEngineMessage(e.data);
	// Remove the error handler (no longer needed after worker is ready)
	engine.worker.onerror = null;
	onMovePlayed(); // Catches a move played while the engine was still loading.
	// Ensures if the debug mode was on before starting an engine game,
	// the engine generated legal moves are rendered as soon as the engine is ready.
	enginelegalmovesdebug.requestMovesForCurrentPosition();
}

/** Aborts a failed engine load: reports it, resigns the server game, tears the worker down. */
function failEngineLoad(error: Error): void {
	console.error(error);
	if (gamesession.getGameType() === 'online') {
		resignFailedEngine();
		toast.show('The engine failed to load and has resigned the game.', { error: true });
	} else toast.show('The engine failed to load. Please refresh.', { error: true });
	terminate();
}

/**
 * This method is called externally when the player submits his move in an engine game
 * It submits the gamefile to the webworker
 */
function onMovePlayed(): void {
	// Not an engine game, or the engine is still loading — onEngineReady() requests the move once it's up.
	if (!engine?.ready) return;
	const gamefile = gameslot.getGamefile()!;
	// Make sure it's the engine's turn
	if (gamefile.whosTurn !== engineColor) return; // Don't do anything if it's our turn (not the engines)

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

	if (gamefile.gameConclusion) return;
	engine.worker.postMessage({
		stringGamefile,
		lf: longformIn,
		engineConfig: engineConfig,
		youAreColor: engineColor,
		wtime: timing?.wtime,
		btime: timing?.btime,
		winc: timing?.winc,
		binc: timing?.binc,
	});
}

function handleEngineMessage(data: any): void {
	// console.log('Received message from engine worker:', data);

	const gamefile = gameslot.getGamefile();
	if (!gamefile) {
		console.error('Received an engine reply after the game unloaded:', data);
		return;
	}
	if (gamefile.gameConclusion) {
		console.error('Received an engine reply after the game concluded:', data);
		return;
	}

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
	if (!engine) return console.error('Attempting to make engine move, but no engine loaded!');

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();
	if (gamefile.gameConclusion) {
		console.error('Attempted to apply an engine move after the game concluded:', tokenMove);
		return;
	}

	if (tokenMove === null) {
		// Null can mean the engine didn't return a best move (perhaps it didn't
		// find any legal moves, or thought it was checkmate), or an error occurred.
		// In this case, resign for the engine.
		console.log(`Engine returned a null move. Resigning the game...`);
		if (gamesession.getGameType() === 'online') resignFailedEngine();
		else {
			gamefile.gameConclusion = { condition: 'resignation', victor: gamesession.getRole()! };
			gameslot.concludeGame();
		}
		return;
	}

	premoves.performWithUnapplied(gamefile, mesh, () => {
		const moveValidationResults = movevalidation.isTokenMoveLegal(gamefile, tokenMove);

		if (!moveValidationResults.valid) {
			toast.show(
				`Engine submitted an illegal move. Please report this bug! Move "${tokenMove}" is illegal for reason: ${moveValidationResults.reason}`,
				{ error: true, durationMultiplier: 100 },
			);
			if (gamesession.getGameType() === 'online') resignFailedEngine();
			return false; // Don't physically play next premove
		}

		if (moveutil.areWeViewingLatestMove(gamefile)) {
			// Normal case: play and animate the move.
			movesequence.makeMoveAndAnimate(gamefile, mesh, moveValidationResults.tagged);
		} else {
			// We're reviewing a past move. Silently append it, staying on our current view.
			movesequence.makeMoveKeepingView(gamefile, mesh, moveValidationResults.tagged);
		}

		GameBus.dispatch('engine-move-played');

		return true; // Good to physically play next premove
	});

	selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.
}

/** Asks the server to resign the engine in the current online game. */
function resignFailedEngine(): void {
	socketmessages.send('game', 'engineresign', undefined, true);
}

/** Requests engine-generated legal moves for the currently viewed position. */
function requestGeneratedMoves(gamefile: GameFile): void {
	if (!engine?.ready) return; // The overlay gates on canRequest(), so this is belt-and-braces.

	// Compress the gamefile as a single position (not including future moves)
	// This ensures the engine analyzes the currently viewed position
	const longformIn = gamecompressor.compressGamefile(gamefile, true);
	const stringGamefile = JSON.stringify(gamefile, jsutil.stringifyReplacer);

	engine.worker.postMessage({
		stringGamefile,
		lf: longformIn,
		engineConfig: engineConfig,
		youAreColor: engineColor,
		requestGeneratedMoves: true,
	});
}

/**
 * Lazy SMP search threads for the engine: the hardware thread count minus one
 * (leaving the main thread breathing room), capped at 4. Threading requires
 * cross-origin isolation (SharedArrayBuffer); without it the engine runs single-threaded.
 */
function getEngineThreadCount(): number {
	return maxEngineThreads(THREAD_CAP, 1);
}

/** Stops the active engine worker and clears its session state. */
function terminate(): void {
	engine?.worker.terminate();
	engine = undefined;
	engineColor = undefined;
	engineConfig = undefined;
	enginelegalmovesdebug.detach();
}

// Export ---------------------------------------------------------------------------------

export default {
	initEngineGame,
	onMovePlayed,
};

export type { EngineConfig };
