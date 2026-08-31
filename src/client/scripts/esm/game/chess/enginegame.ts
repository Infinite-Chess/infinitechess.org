// src/client/scripts/esm/game/chess/enginegame.ts

/**
 * Keeps track of the data of the engine game we are currently in.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { EngineAndConfig } from '../../../../../shared/chess/util/engine.js';
import type {
	ApeironMoveRequest,
	CheckmatePracticeMoveRequest,
	EngineInitRequest,
	EngineInitResponse,
	EngineResponse,
} from './engines/engineprotocol.js';

import timeutil from '../../../../../shared/util/timeutil.js';
import moveutil from '../../../../../shared/chess/logic/moveutil.js';
import movevalidation from '../../../../../shared/chess/logic/movevalidation.js';
import { ENGINE_DICTIONARY } from '../../../../../shared/chess/util/engine.js';
import typeutil, { players as p } from '../../../../../shared/chess/util/typeutil.js';

import toast from '../../components/toast.js';
import gameslot from './gameslot.js';
import premoves from './premoves.js';
import selection from './selection.js';
import engineicn from './engines/engineicn.js';
import enginewasm from './engines/enginewasm.js';
import { GameBus } from '../../board/GameBus.js';
import gamesession from './gamesession.js';
import movesequence from './movesequence.js';
import socketintents from '../../socket/socketintents.js';
import gamecompressor from '../../chess/gamecompressor.js';
import enginelegalmoves from '../debug/enginelegalmoves.js';

// State -----------------------------------------------------------------------

/**
 * The engine worker of the game we're in, if any.
 * `name` keys its {@link ENGINE_DICTIONARY} entry, for the properties that vary per engine.
 * `ready` flips true on its 'readyok' message; until then it answers nothing.
 * `config` is sent to the worker with every move request.
 * `color` is the side the engine plays — ours inverted.
 */
let engine: ({ worker: Worker; ready: boolean; color: Player } & EngineAndConfig) | undefined;

// Events ----------------------------------------------------------------------

GameBus.addEventListener('user-move-played', () => onMovePlayed());
GameBus.addEventListener('game-concluded', () => terminate());
GameBus.addEventListener('game-unloaded', () => terminate());

// Functions -------------------------------------------------------------------

/**
 * Inits an engine game. In particular, it needs gameOptions in order to know what engine to use for this enginegame.
 * This method launches an engine webworker for the current game.
 * Deliberately not awaitable: the board never waits on the engine. Once the worker is ready it
 * requests a move itself, catching any played while it loaded.
 */
function initEngineGame(options: {
	youAreColor: Player;
	/** Which engine the game is against, with the config its worker expects. */
	engine: EngineAndConfig;
	/** Hashed URL of the engine's worker script. */
	workerUrl: string;
	/**
	 * Served engine-glue URL (`manifest['engine']`) for wasm-engine workers that load it at
	 * runtime (apeiron). Sent to the worker as an init message, with the thread count.
	 */
	engineUrl: string;
}): void {
	console.log(`Starting engine game with engine "${options.engine.name}".`);

	// Initialize the engine as a webworker
	if (!window.Worker) {
		return failEngineLoad(new Error("Cannot finish loading engine game because web workers aren't supported.")); // prettier-ignore
	}

	const worker = new Worker(options.workerUrl, {
		type: 'module',
	}); // module type allows the web worker to import methods and types from other scripts.
	engine = {
		worker,
		ready: false,
		color: typeutil.invertPlayer(options.youAreColor),
		...options.engine,
	};

	// Installed per engine game, so the debug toggle stays inert where no engine is loaded
	// (spectators). Apeiron alone answers a generated-moves request — leaving it uninstalled
	// for the practice bot keeps requests it never replies to out of the pending queue.
	// Requests wait for 'readyok'; onEngineReady() then fires them.
	if (options.engine.name === 'apeiron')
		enginelegalmoves.init({
			canRequest: () => engine?.ready === true,
			requestMoves: ({ gamefile }) => requestGeneratedMoves(gamefile),
		});

	// Set up a handler for the 'isready' command that indicates the worker is loaded and ready
	// We have to manually send this message at the top of our engines.
	worker.onmessage = (e: MessageEvent<EngineInitResponse>): void => {
		if (e.data === 'readyok') onEngineReady();
		else failEngineLoad(new Error(`Engine failed to initialize: ${e.data.message}`));
	};
	worker.onerror = (e: ErrorEvent): void => {
		failEngineLoad(new Error('Worker failed to load: ' + e.message));
	};
	if (ENGINE_DICTIONARY[options.engine.name].hasGlue)
		worker.postMessage({
			engineUrl: options.engineUrl,
			threads: getEngineThreadCount(),
		} satisfies EngineInitRequest);
}

/** Opens the engine for business once its worker signals it has finished fetching/loading. */
function onEngineReady(): void {
	if (!engine) return; // A straggling 'readyok' from a worker terminated mid-load — the game ended.
	engine.ready = true;
	// Overwrite the onmessage listener to listen for move submissions
	engine.worker.onmessage = (e: MessageEvent<EngineResponse>): void =>
		handleEngineMessage(e.data);
	// Remove the error handler (no longer needed after worker is ready)
	engine.worker.onerror = null;
	onMovePlayed(); // Catches a move played while the engine was still loading.
	// Ensures if the debug mode was on before starting an engine game,
	// the engine generated legal moves are rendered as soon as the engine is ready.
	enginelegalmoves.requestMovesForCurrentPosition();
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
	if (gamefile.whosTurn !== engine.color) return; // Don't do anything if it's our turn (not the engines)

	// Request the engine to perform a best move calculation...

	// Compress the gamefile to send to the engine in a simpler json format. Engines that don't
	// read the move history get the current position on its own, rather than the start position
	// plus every move to replay onto it.
	const longformIn = gamecompressor.compressGamefile(
		gamefile,
		!ENGINE_DICTIONARY[engine.name].needsMoveHistory,
	);

	if (gamefile.gameConclusion) return;

	if (engine.name === 'apeiron') {
		engineicn.prepareForEngine(longformIn);
		// UCI-style clock values, in millis. Untimed games (no clocks) send none.
		const clocks = gamefile.clocks;
		const incrementMillis = clocks && timeutil.toMillis(clocks.startTime.increment, 'seconds');
		engine.worker.postMessage({
			lf: longformIn,
			engineConfig: engine.config,
			youAreColor: engine.color,
			wtime: clocks?.currentTime[p.WHITE],
			btime: clocks?.currentTime[p.BLACK],
			winc: incrementMillis,
			binc: incrementMillis,
		} satisfies ApeironMoveRequest);
	} else {
		engine.worker.postMessage({
			lf: longformIn,
			engineConfig: engine.config,
			youAreColor: engine.color,
		} satisfies CheckmatePracticeMoveRequest);
	}
}

function handleEngineMessage(data: EngineResponse): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) {
		console.error('Received an engine reply after the game unloaded:', data);
		return;
	}
	if (gamefile.gameConclusion) {
		console.error('Received an engine reply after the game concluded:', data);
		return;
	}

	if (data.type === 'move') makeEngineMove(data.data);
	else enginelegalmoves.receiveMovesForOldestRequest(data.data);
}

/**
 * This method takes care of all the logic involved in making an engine move
 * It gets called after the engine finishes its calculation
 * @param tokenMove - The engine's move in compact format "x,y>x,y=P", or null if it has none.
 */
function makeEngineMove(tokenMove: string | null): void {
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

	// Can rarely happen if the server forced us to resync, undoing our move.
	if (gamePageData.role === gamefile.whosTurn) {
		console.error(`Engine returned a move when it was our turn. Ignoring it: ${tokenMove}`);
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
	socketintents.submit('game', 'engineresign', undefined, () => gameslot.isGameLive());
}

/** Requests engine-generated legal moves for the currently viewed position. */
function requestGeneratedMoves(gamefile: GameFile): void {
	// The overlay gates on canRequest(), and is only installed for engines that answer these.
	if (!engine?.ready || engine.name !== 'apeiron') return;

	// Compress the gamefile as a single position (not including future moves)
	// This ensures the engine analyzes the currently viewed position
	const longformIn = gamecompressor.compressGamefile(gamefile, true);
	engineicn.prepareForEngine(longformIn);

	engine.worker.postMessage({
		lf: longformIn,
		engineConfig: engine.config,
		youAreColor: engine.color,
		requestGeneratedMoves: true,
	} satisfies ApeironMoveRequest);
}

/**
 * Lazy SMP search threads for the engine: the hardware thread count minus one
 * (leaving the main thread breathing room), capped at 4. Threading requires
 * cross-origin isolation (SharedArrayBuffer); without it the engine runs single-threaded.
 */
function getEngineThreadCount(): number {
	return enginewasm.maxThreads(1);
}

/** Stops the active engine worker and clears its session state. */
function terminate(): void {
	engine?.worker.terminate();
	engine = undefined;
	enginelegalmoves.detach();
}

// Export ----------------------------------------------------------------------

export default {
	initEngineGame,
	onMovePlayed,
};
