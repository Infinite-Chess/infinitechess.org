// src/client/scripts/esm/game/chess/engines/engineprotocol.ts

/**
 * The message protocol between the page (enginegame.ts) and the gameplay engine workers.
 *
 * Requests are per-engine: the page sends the shape matching the engine it launched the worker
 * for, and each worker declares only its own. The analysis board's workers speak a separate
 * protocol, declared in apeironanalysis.worker.ts.
 */

import type { Player } from '../../../../../../shared/util/typeutil.js';
import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import type {
	ApeironEngineConfig,
	BaseEngineConfig,
	CheckmatePracticeEngineConfig,
} from '../../../../../../shared/chess/engine.js';

// Requests -------------------------------------------------------------

/** The first message to an engine whose worker loads its glue at runtime (`hasGlue`). */
export interface EngineInitRequest {
	/** Served engine-glue URL (from the asset manifest). */
	engineUrl: string;
	/** Lazy SMP search threads (1 = single-threaded). */
	threads: number;
}

/** What every engine is asked for a move with. */
interface EngineMoveRequest {
	/** The compressed position/game to search. */
	lf: LongFormatIn;
	/** Search settings the user chose for this engine game. Narrowed per engine below. */
	engineConfig: BaseEngineConfig;
	/** The color the engine is playing, which the returned move is cased for. */
	youAreColor: Player;
}

/** A move request for `engineCheckmatePractice`. */
export interface CheckmatePracticeMoveRequest extends EngineMoveRequest {
	engineConfig: CheckmatePracticeEngineConfig;
}

/** A move request for `apeiron`. */
export interface ApeironMoveRequest extends EngineMoveRequest {
	engineConfig: ApeironEngineConfig;
	/** UCI-style clock remaining, in ms. Absent in untimed games. */
	wtime?: number;
	btime?: number;
	/** UCI-style clock increment, in ms. Absent in untimed games. */
	winc?: number;
	binc?: number;
	/** Debug: post the position's generated legal moves instead of searching for a move. */
	requestGeneratedMoves?: boolean;
}

// Responses ------------------------------------------------------------

/** A worker's reply while it loads, before the page swaps in its move listener. */
export type EngineInitResponse =
	/** The worker is up and will answer move requests. */
	| 'readyok'
	/** The engine failed to load. The worker closes itself after posting this. */
	| { type: 'initerror'; message: string };

/** A worker's reply to a move request. */
export type EngineResponse =
	/** The engine's move as a compact ICN token, or null when it has none — the page resigns for it. */
	| { type: 'move'; data: string | null }
	/** Compact move tokens ("x,y>x,y"), answering an {@link ApeironMoveRequest} `requestGeneratedMoves`. */
	| { type: 'generatedMoves'; data: string[] };
