// scripts/cheatdetection/lib/simulate.ts

/**
 * Simulated cheaters: a player's real game with some of their moves replaced by an engine's choice
 * in the same positions, judged by production's own moveEvidence. A replacement outside the
 * detector's lines is valued from the off-line pass's analysis of the position after it, as
 * production values any such move from the position the game reached.
 *
 * Swapping one move invalidates the rest of the real game, so a simulated game is never one legal
 * whole game: every swapped move is judged in the position the real player faced.
 */

import type { MoveEvidence } from '../../../src/server/game/cheatdetection/moveEvidence.js';
import type { PositionAnalysis } from '../../../src/server/game/cheatdetection/cheatDetectionTypes.js';
import type { AfterPositions, GameData } from './corpus.js';

import moveEvidence from '../../../src/server/game/cheatdetection/moveEvidence.js';

import corpus from './corpus.js';

// Types -----------------------------------------------------------------------

/** How a simulated cheater uses the engine. */
type Style =
	/** Every move. */
	| 'full'
	/** Every move of every other game, honest in between. */
	| 'alternating'
	/** Each move with probability 0.4, or 0.2. */
	| 'partial40'
	| 'partial20'
	/** Checks the engine on half their moves, and takes its move only where their own was a miss. */
	| 'rescue'
	/** Two moves per game, both where their own move was a miss. */
	| 'critical2'
	/** The engine's 2nd or 3rd choice, every move. */
	| 'second'
	/** The site's level-6 bot, every move. Tied to today's level tuning. */
	| 'level6';

/** One swapped move. */
interface Substitution {
	ply: number;
	engine: string;
}

/** A simulated game, as the cheating player's evidence. */
interface CheatedGame {
	evidence: MoveEvidence[];
	/** Swaps whose position-after hasn't been analysed off-line yet: the evidence is empty until it is. */
	missing: { gameId: number; ply: number; move: string }[];
}

// Constants -------------------------------------------------------------------

const STYLES: Style[] = ['full', 'alternating', 'partial40', 'partial20', 'rescue', 'critical2', 'second', 'level6']; // prettier-ignore

// Randomness ------------------------------------------------------------------

/** A seeded xorshift generator in [0, 1), so every simulation and bootstrap is reproducible. */
function rng(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
}

// Simulation ------------------------------------------------------------------

/**
 * The evidence the player at `parity` would have left had they played `style`'s engine moves.
 * @param gameIndex - The game's place in the player's history, from 0; also seeds its randomness.
 * @param honest - Their real evidence from the game, which the miss-driven styles read.
 */
function cheat(
	game: GameData,
	parity: 0 | 1,
	style: Style,
	gameIndex: number,
	after: AfterPositions,
	honest: MoveEvidence[],
): CheatedGame {
	if (style === 'alternating' && gameIndex % 2 === 1) return { evidence: honest, missing: [] };
	const moves = [...game.moves];
	const afters = new Map<number, PositionAnalysis>();
	const missing: CheatedGame['missing'] = [];
	const random = rng(game.gameId * 7 + gameIndex);
	for (const { ply, engine } of choose(game, parity, style, honest, random)) {
		if (moveEvidence.sameMove(engine, game.moves[ply]!)) continue;
		moves[ply] = engine;
		const before = game.positions[ply]!;
		// Judged by its own line.
		if (
			!before.refused &&
			before.lines.some((line) => moveEvidence.sameMove(line.move, engine))
		)
			continue;
		const analysed = after.get(corpus.afterKey(game.gameId, ply, engine));
		if (analysed) afters.set(ply, analysed);
		else missing.push({ gameId: game.gameId, ply, move: engine });
	}
	if (missing.length) return { evidence: [], missing };
	// Judged in the real game's positions, only the one after a swap replaced, so how much each
	// opponent move threw away is the real game's.
	const { positions } = game;
	const evidence: MoveEvidence[] = [];
	for (let ply = parity; ply < moves.length; ply += 2) {
		const judged = moveEvidence.judge(positions[ply - 1], positions[ply]!, afters.get(ply) ?? positions[ply + 1]!, moves[ply]!); // prettier-ignore
		if (judged) evidence.push({ ply, ...judged });
	}
	return { evidence, missing };
}

/** The moves a style replaces, and what with. */
function choose(
	game: GameData,
	parity: 0 | 1,
	style: Style,
	honest: MoveEvidence[],
	random: () => number,
): Substitution[] {
	const misses = honest.filter((e) => e.outcome === 'miss').map((e) => e.ply);
	const critical = new Set<number>();
	while (style === 'critical2' && critical.size < Math.min(2, misses.length)) critical.add(misses[Math.floor(random() * misses.length)]!); // prettier-ignore

	const out: Substitution[] = [];
	for (let ply = parity; ply < game.moves.length; ply += 2) {
		const position = game.positions[ply]!;
		const picks = game.cheat?.[ply];
		if (position.refused || position.legal <= 1 || !picks?.lines.length) continue;
		const top = picks.lines[0]!.move;
		const engine = pick(style, top, picks.lines.slice(1, 3), picks.level6, misses.includes(ply), critical.has(ply), random); // prettier-ignore
		if (engine !== undefined) out.push({ ply, engine });
	}
	return out;
}

/** A style's move at one position, or undefined to keep the player's own. */
function pick(
	style: Style,
	top: string,
	alternatives: { move: string }[],
	level6: string | undefined,
	isMiss: boolean,
	isCritical: boolean,
	random: () => number,
): string | undefined {
	switch (style) {
		case 'full':
		case 'alternating':
			return top;
		case 'partial40':
			return random() < 0.4 ? top : undefined;
		case 'partial20':
			return random() < 0.2 ? top : undefined;
		case 'rescue':
			return random() < 0.5 && isMiss ? top : undefined;
		case 'critical2':
			return isCritical ? top : undefined;
		case 'second':
			return alternatives.length ? alternatives[Math.floor(random() * alternatives.length)]!.move : top; // prettier-ignore
		case 'level6':
			return level6;
	}
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	STYLES,
	// Randomness
	rng,
	// Simulation
	cheat,
};
