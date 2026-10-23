// scripts/cheatdetection/lib/researchengine.ts

/**
 * The Apeiron WASM build loaded in this process, for the engine searches the production worker
 * doesn't make: a cheater's engine (its own settings), the site's level-6 bot, and one position
 * at a time for off-line valuation. Single-threaded: the build's thread pool is never started.
 */

import type {
	EngineScore,
	ScoredMove,
} from '../../../src/server/game/cheatdetection/cheatDetectionTypes.js';
import type {
	AnalysisInfo,
	AnalysisLine,
	AnalysisWasmEngine,
	AnalysisWasmModule,
	GameplayWasmEngine,
} from '../../../src/shared/chess/util/engineglue.js';

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import engineglue from '../../../src/shared/chess/util/engineglue.js';

import settings from './settings.js';

// Types -----------------------------------------------------------------------

/** The analysis glue, constructing engines that can also play as the strength-limited bot. */
interface ResearchWasmModule extends AnalysisWasmModule {
	Engine: { from_icn: (icn: string, config: { strength_level?: number }) => ResearchWasmEngine };
}

/** An engine that analyses and plays, plus the one call only the research makes. */
interface ResearchWasmEngine extends AnalysisWasmEngine, GameplayWasmEngine {
	is_in_check: () => boolean;
}

/** A searched position: its legal-move count, whether the side to move is in check, and the final lines. */
interface Searched {
	legal: number;
	inCheck: boolean;
	lines: ScoredMove[];
}

// State -----------------------------------------------------------------------

let glue: ResearchWasmModule | undefined;

// Engine ----------------------------------------------------------------------

/** Loads the engine glue and its wasm. Call once before any search. */
async function load(hashMb: number): Promise<void> {
	(globalThis as { name?: string }).name ??= 'research';
	const glueUrl = pathToFileURL(path.join(settings.ENGINE_PKG, 'apeiron.js')).href;
	glue = (await import(glueUrl)) as ResearchWasmModule;
	const wasm = readFileSync(path.join(settings.ENGINE_PKG, 'apeiron_bg.wasm'));
	await glue.default({ module_or_path: wasm });
	glue.set_hash_size(hashMb);
}

/**
 * A search session over one game's positions, its transposition table kept warm between them,
 * as the production worker searches a game. Free it when the game is done.
 */
class Session {
	private engine: ResearchWasmEngine | undefined;

	/** Clears the engine's transposition table for a new game. */
	constructor() {
		glue!.reset_engine_state();
	}

	/**
	 * Searches `icn` with `multiPv` lines to `nodes` nodes. Undefined when the engine refuses it.
	 * @throws If the engine returns fewer lines than asked, or an unscored one: its protocol changed.
	 */
	search(icn: string, multiPv: number, nodes: number): Searched | undefined {
		if (!this.place(icn)) return undefined;
		const engine = this.engine!;
		const legal = engine.get_legal_moves_js().length;
		const out: Searched = { legal, inCheck: engine.is_in_check(), lines: [] };
		if (legal <= 1) return out;
		let last: AnalysisInfo | undefined;
		const options = { multi_pv: Math.min(multiPv, legal), start_depth: 1, slice_ms: 0, max_nodes: nodes }; // prettier-ignore
		engine.analyse(options, (info) => {
			if (info.lines[0]?.moves.length) last = info;
		});
		out.lines = (last?.lines ?? []).filter((line) => line.moves.length > 0).map((line) => ({ move: line.moves[0]!, score: toScore(line) })); // prettier-ignore
		if (out.lines.length < options.multi_pv) throw Error(`The engine returned ${out.lines.length} of ${options.multi_pv} lines`); // prettier-ignore
		return out;
	}

	/** Frees the session's engine. */
	free(): void {
		this.engine?.free();
		this.engine = undefined;
	}

	/** Moves the engine to `icn`. False when the engine refuses the position as too spread out. */
	private place(icn: string): boolean {
		try {
			if (this.engine) this.engine.set_position(icn);
			else this.engine = glue!.Engine.from_icn(icn, {});
			return true;
		} catch (e) {
			if (engineglue.asRefusal(e) !== undefined) return false;
			throw e;
		}
	}
}

/** The site's strength-limited bot's move at `level` given `ms` to think, or undefined when refused. */
function levelMove(icn: string, level: number, ms: number): string | undefined {
	let engine: ResearchWasmEngine;
	try {
		engine = glue!.Engine.from_icn(icn, { strength_level: level });
	} catch (e) {
		if (engineglue.asRefusal(e) !== undefined) return undefined;
		throw e;
	}
	try {
		const best = engine.get_best_move_with_time(ms, true);
		return best ? `${best.from}>${best.to}` : undefined;
	} finally {
		engine.free();
	}
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

// Exports ---------------------------------------------------------------------

export default {
	load,
	Session,
	levelMove,
};
