// src/server/game/cheatdetection/engineAnalysisWorker.ts

/**
 * The worker thread that runs the Apeiron WASM engine over finished games, off the main thread.
 * Each request is one stored game ICN; the reply is a MultiPV analysis of every position in it,
 * with the board facts detection reads beside it, or the reason none could be made.
 * Single-threaded: the build's Lazy SMP pool is never started.
 */

import type { GameFile } from '../../../shared/chess/logic/gamefile.js';
import type {
	AnalysisInfo,
	AnalysisLine,
	AnalysisWasmEngine,
	AnalysisWasmModule,
} from '../../../shared/chess/util/engineglue.js';
import type {
	DetectorSearch,
	EngineAnalysisReply,
	EngineAnalysisRequest,
	EngineLine,
	EngineScore,
	EngineWorkerData,
	PositionAnalysis,
} from './cheatDetectionTypes.js';

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

import jsutil from '../../../shared/util/jsutil.js';
import movepiece from '../../../shared/chess/logic/movepiece.js';
import repetition from '../../../shared/chess/logic/repetition.js';
import engineglue from '../../../shared/chess/util/engineglue.js';
import apeironcard from '../../../shared/chess/engines/apeironcard.js';

import gameReplay from './gameReplay.js';

// State -----------------------------------------------------------------------

let glue: AnalysisWasmModule;
let search: DetectorSearch;

// Analysis --------------------------------------------------------------------

/** Analyses every position of a stored game, or says why it can't be. */
async function analyseGame(request: EngineAnalysisRequest): Promise<EngineAnalysisReply> {
	const game = await gameReplay.loadAtStart(request.icn);
	const { longformat, gamefile } = game;
	if (!apeironcard.isGameReviewSupported(gamefile).supported)
		return { gameId: request.gameId, outcome: 'unsupported' };

	const parsedMoves = longformat.moves ?? [];

	glue.reset_engine_state();
	let engine: AnalysisWasmEngine | undefined;
	const positions: PositionAnalysis[] = [];
	try {
		for (let ply = 0; ply <= parsedMoves.length; ply++) {
			const placed = placeEngine(
				engine,
				gameReplay.engineIcn(game, parsedMoves.slice(0, ply)),
			);
			if (placed === undefined) positions.push({ refused: true });
			else {
				engine = placed;
				positions.push(analysePosition(engine, gamefile));
			}
			if (ply < parsedMoves.length)
				movepiece.calculateAndMakeMove(gamefile, parsedMoves[ply]!);
		}
	} finally {
		engine?.free();
	}
	return { gameId: request.gameId, outcome: 'analysed', moves: parsedMoves.map((move) => move.token), positions }; // prettier-ignore
}

/** Moves the engine to `icn`, or builds one there. Undefined when the engine refuses the position. */
function placeEngine(
	engine: AnalysisWasmEngine | undefined,
	icn: string,
): AnalysisWasmEngine | undefined {
	try {
		if (!engine) return glue.Engine.from_icn(icn, {});
		engine.set_position(icn);
		return engine;
	} catch (e) {
		if (engineglue.asRefusal(e) !== undefined) return undefined;
		throw e;
	}
}

/**
 * Searches one position to the node budget, keeping its final lines and each depth's top move.
 * @throws If the engine returns fewer lines than asked, or an unscored one: its protocol changed.
 */
function analysePosition(engine: AnalysisWasmEngine, gamefile: GameFile): PositionAnalysis {
	const legal = engine.get_legal_moves_js().length;
	const analysis: PositionAnalysis = {
		legal,
		inCheck: gameReplay.isInCheck(gamefile),
		repeated: repetition.isRepeated(gamefile),
		lines: [],
		topByDepth: [],
	};
	if (legal <= 1) return analysis; // Nothing to choose between.

	let last: AnalysisInfo | undefined;
	const options = { multi_pv: Math.min(search.multiPv, legal), start_depth: 1, slice_ms: 0, max_nodes: search.positionNodes }; // prettier-ignore
	engine.analyse(options, (info) => {
		const top = info.lines[0];
		if (!top?.moves.length) return;
		last = info;
		analysis.topByDepth.push(top.moves[0]!);
	});
	analysis.lines = (last?.lines ?? []).filter((line) => line.moves.length > 0).map((line) => toLine(line, gamefile)); // prettier-ignore
	// Load-bearing: a working engine returns every line asked for, so fewer means its protocol changed
	// (an option it no longer reads silently falls back to one line).
	if (analysis.lines.length < options.multi_pv) throw Error(`The engine returned ${analysis.lines.length} of ${options.multi_pv} lines`); // prettier-ignore
	return analysis;
}

/**
 * A streamed line as an {@link EngineLine}, with whether its first move lands on a piece.
 * @throws If the line is unscored: the engine's protocol changed.
 */
function toLine(line: AnalysisLine, gamefile: GameFile): EngineLine {
	const move = line.moves[0]!;
	return { move, score: toScore(line), captures: gameReplay.isCapture(gamefile, move) };
}

/**
 * A streamed line's score.
 * @throws If the line has neither a cp nor a mate score: the engine's protocol changed.
 */
function toScore(line: AnalysisLine): EngineScore {
	if (line.mate !== undefined) return { mate: line.mate };
	if (line.cp !== undefined) return { cp: line.cp };
	throw Error('The engine returned a line with neither a cp nor a mate score');
}

// Messaging -------------------------------------------------------------------

/** Loads the engine glue the host names, then answers requests one at a time. */
async function start(): Promise<void> {
	// wasm-bindgen-rayon's worker helper reads the browser worker global `name` on import.
	(globalThis as { name?: string }).name ??= 'cheat-detection';
	const data: EngineWorkerData = workerData;
	search = data.search;
	glue = (await import(pathToFileURL(data.gluePath).href)) as AnalysisWasmModule;
	await glue.default({ module_or_path: readFileSync(data.wasmPath) });
	glue.set_hash_size(search.hashMb);

	parentPort!.on('message', (request: EngineAnalysisRequest) => {
		analyseGame(request)
			.catch(
				(e): EngineAnalysisReply => ({
					gameId: request.gameId,
					outcome: 'failed',
					reason: jsutil.getErrorMessage(e),
				}),
			)
			.then((reply) => parentPort!.postMessage(reply));
	});
	parentPort!.postMessage('ready');
}

void start();
