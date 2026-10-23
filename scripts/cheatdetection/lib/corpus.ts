// scripts/cheatdetection/lib/corpus.ts

/**
 * The research's data files and the shapes in them: the engine passes' outputs, and the corpus
 * build-corpus.ts joins them into, one record per game in production's own shapes, so production's
 * evidence and scoring run on it unchanged.
 */

import type {
	EngineAnalysisReply,
	PositionAnalysis,
	ScoredMove,
} from '../../../src/server/game/cheatdetection/cheatDetectionTypes.js';

import path from 'node:path';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';

import settings from './settings.js';

// Types -----------------------------------------------------------------------

interface PlayerInfo {
	userId: number;
	/** 0 = moves at even plies (white), 1 = odd. */
	parity: 0 | 1;
	/** The rating and deviation they held going into the game. */
	elo: number;
	rd: number;
	/** 1 win, 0.5 draw, 0 loss. */
	score: number | null;
}

/** A cheater engine's choices in one position, and the site's level-6 bot's. */
export interface CheatPicks {
	lines: ScoredMove[];
	level6?: string;
}

/** One game of the corpus. */
export interface GameData {
	gameId: number;
	/** Start time, epoch ms. */
	date: number;
	players: PlayerInfo[];
	moves: string[];
	/** Think time per ply in ms; undefined for each player's first move, which has no stamp before it. */
	thinks: (number | undefined)[];
	/** As the production engine worker reports them, the start position first. */
	positions: PositionAnalysis[];
	/** Per ply, once the cheater pass has covered the game. */
	cheat?: (CheatPicks | undefined)[];
}

/** A detector-pass record: the production worker's reply for one game. */
export interface DetectorRecord {
	gameId: number;
	reply: EngineAnalysisReply;
}

/** A cheater- or level6-pass record: the engine's choice at each ply of one game. */
export interface PicksRecord {
	gameId: number;
	/** Per ply: the cheater engine's lines, or the level-6 move. Null where the engine refused. */
	plies: (CheatPicks['lines'] | string | null)[];
}

/** A substituted move awaiting off-line analysis, as build-corpus.ts lists them. */
export interface PendingMove {
	gameId: number;
	ply: number;
	move: string;
}

/** Analyses of the positions after substituted moves, keyed by {@link afterKey}. */
export type AfterPositions = Map<string, PositionAnalysis>;

/** One record of off-line valuation: the position after a substituted move. */
export interface OffLineRecord {
	key: string;
	position: PositionAnalysis;
}

// Files -----------------------------------------------------------------------

/** A data file's path, its directory created on first use. */
function file(name: string): string {
	mkdirSync(settings.DATA_DIR, { recursive: true });
	return path.join(settings.DATA_DIR, name);
}

/** Every record of every `<prefix>*.jsonl` file in the data directory. */
function readRecords<T>(prefix: string): T[] {
	if (!existsSync(settings.DATA_DIR)) return [];
	const records: T[] = [];
	for (const name of readdirSync(settings.DATA_DIR).filter(
		(f) => f.startsWith(prefix) && f.endsWith('.jsonl'),
	)) {
		for (const line of readFileSync(path.join(settings.DATA_DIR, name), 'utf8').split('\n')) {
			if (line) records.push(JSON.parse(line));
		}
	}
	return records;
}

/** Appends one record to a `.jsonl` data file. */
function append(name: string, record: object): void {
	appendFileSync(file(name), JSON.stringify(record) + '\n');
}

// Corpus ----------------------------------------------------------------------

/** Every game build-corpus.ts wrote. */
function loadCorpus(): GameData[] {
	return readRecords<GameData>('corpus');
}

/** The key of a position reached by playing `move` at `ply` of a game. */
function afterKey(gameId: number, ply: number, move: string): string {
	return `${gameId}/${ply}/${move.split('=')[0]}`;
}

/** Every position the off-line pass analysed. */
function loadAfterPositions(): AfterPositions {
	return new Map(readRecords<OffLineRecord>('offline-').map((r) => [r.key, r.position]));
}

// Exports ---------------------------------------------------------------------

export default {
	// Files
	file,
	readRecords,
	append,
	// Corpus
	loadCorpus,
	afterKey,
	loadAfterPositions,
};
