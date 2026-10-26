// src/server/game/cheatdetection/cheatDetectionTypes.ts

/**
 * The shapes engine-assistance detection works in: what the engine worker reports per
 * position and the messages between it and its host, and the interaction data a rated game
 * collects from its players.
 *
 * Pure vocabulary — no logic, no dependencies on sibling modules.
 */

// Engine Analysis -------------------------------------------------------------

/** A score from the side to move's view: centipawns, or mate in N moves (negative = getting mated). */
export type EngineScore = { cp: number } | { mate: number };

/** A move, as a compact ICN token, and the engine's score for it. */
export interface ScoredMove {
	move: string;
	score: EngineScore;
}

/** One MultiPV line: its first move and its score. */
export interface EngineLine extends ScoredMove {
	/** Whether its first move lands on a piece. */
	captures: boolean;
	/** Whether its first move checks the opponent. */
	checks: boolean;
}

/** A position the engine searched, with the board facts read beside it. */
export interface AnalysedPosition {
	refused?: undefined;
	/** Legal moves in the position. 0 = the game is over here, 1 = forced. */
	legal: number;
	inCheck: boolean;
	/** The same position, same side to move, occurred earlier in the game. */
	repeated: boolean;
	/** The final search's lines, best first. Empty when there was nothing to search. */
	lines: EngineLine[];
	/** The top move after each completed depth, from depth 1. */
	topByDepth: string[];
}

/** The engine's view of one position of a game. */
export type PositionAnalysis =
	| AnalysedPosition
	/** The engine couldn't take the position: its pieces are too spread out to compress. */
	| { refused: true };

/** How the detector searches each position. */
export interface DetectorSearch {
	/** Lines searched per position. */
	multiPv: number;
	/** Node budget per position. */
	positionNodes: number;
	/** Transposition-table size, kept warm across a game's positions. */
	hashMb: number;
}

/** What the engine worker is started with: the engine build's files, and how to search. */
export interface EngineWorkerData {
	gluePath: string;
	wasmPath: string;
	search: DetectorSearch;
}

/** Asks the engine worker to analyse every position of a stored game. */
export interface EngineAnalysisRequest {
	gameId: number;
	/** The game's stored ICN. */
	icn: string;
}

/** The engine worker's answer to an {@link EngineAnalysisRequest}. */
export type EngineAnalysisReply = { gameId: number } & (
	| {
			outcome: 'analysed';
			moves: string[];
			/** `positions[i]` is the position before `moves[i]`; the last is the final position. */
			positions: PositionAnalysis[];
	  }
	/** A variant, piece or rule the engine can't play. */
	| { outcome: 'unsupported' }
	| { outcome: 'failed'; reason: string }
);

// Interaction -----------------------------------------------------------------

/** One move's `SubmitMoveMessage['away']` (`serverbound.ts`), raw as reported, after its ply. */
type AwayRecord = [ply: number, opponentTurnMs: number, ownTurnMs: number, returnedMsBefore: number | null]; // prettier-ignore

/**
 * A position of the game the analysis page's engine displayed while the game stood at it, and how
 * the analysing device was tied to the player: their login, their browser, or only their network.
 * `sharedWithOpponent`: the opponent's sessions are on that network too, so it may have been them.
 */
export type AnalysisMatch = { ply: number } & (
	| { link: 'account' | 'browser' }
	| { link: 'network'; sharedWithOpponent: boolean }
);

/**
 * A player's interaction data from one rated game. Stored as JSON in cheat_interactions and
 * live_player_games: changes to it or the types inside it must keep old rows readable.
 */
export interface Interaction {
	away: AwayRecord[];
	matches: AnalysisMatch[];
}

/** A position a live rated game stood at, from when it was reached until the next one was. */
export interface WatchedPosition {
	ply: number;
	/** Its `positionkey.ts` key. */
	key: string;
	/** When the game reached it, epoch ms. */
	reachedAt: number;
}
