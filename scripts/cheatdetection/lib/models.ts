// scripts/cheatdetection/lib/models.ts

/**
 * Fits the betting score's model from the corpus and scores players with it the way production
 * does. The honest model is fitted on the players' own rated moves, the engine model on how
 * production judges the cheater engine's choices. For evaluation each is held out, by player and by
 * game, from whatever it scores; the model production ships is fitted on everything.
 */

import type { BetModel } from '../../../src/server/game/cheatdetection/bettingScore.js';
import type { MoveEvidence } from '../../../src/server/game/cheatdetection/moveEvidence.js';
import type { AfterPositions, GameData } from './corpus.js';

import bettingScore from '../../../src/server/game/cheatdetection/bettingScore.js';
import moveEvidence from '../../../src/server/game/cheatdetection/moveEvidence.js';

import corpus from './corpus.js';
import logistic from './logistic.js';
import settings from './settings.js';
import simulate from './simulate.js';

// Types -----------------------------------------------------------------------

/** One player's side of one game, with their real evidence from it. */
export interface PlayerGame {
	game: GameData;
	parity: 0 | 1;
	userId: number;
	evidence: MoveEvidence[];
}

/** A game of a player's history to score: theirs for real, or simulated. */
interface Scored {
	pg: PlayerGame;
	evidence: MoveEvidence[];
}

/** Everything fitted from the corpus. */
interface Fitted {
	/** The off-line pass's positions after substituted moves, which simulating cheaters reads. */
	after: AfterPositions;
	/** Every player-game of the rated corpus. */
	playerGames: PlayerGame[];
	/** The same player-games by player, each player's oldest first. */
	byPlayer: Map<number, PlayerGame[]>;
	/** The model that scores a player-game for evaluation: held out from its player and its game. */
	modelFor: (pg: PlayerGame) => BetModel;
	/**
	 * The highest log score a history reaches, checked after each game from `from` on, as production
	 * scores it: the best run ending there within the evidence age, each game against the ceiling of
	 * the rating held going into it.
	 */
	peakScore: (history: Scored[], from?: number) => number;
	/** The model fitted on everything: what production ships. */
	full: BetModel;
	/** How many engine moves the engine model was fitted on. */
	engineMoves: number;
}

/** Weights fitted for one side of the bet. */
interface SideFit {
	good: number[];
	top: number[];
}

// Constants -------------------------------------------------------------------

/** Held-out folds, by player for the honest model and by game for the engine model. */
const FOLDS = 5;

// Fitting ---------------------------------------------------------------------

/** Fits the model on the corpus, with the experiment's cheat fractions and skill ceiling unless one is given. */
function fitCorpus(skillCeiling = settings.SKILL_CEILING): Fitted {
	return fit(corpus.loadCorpus(), corpus.loadAfterPositions(), skillCeiling, settings.CHEAT_FRACTIONS); // prettier-ignore
}

/** Fits the model on `games`, with the ceiling and cheat fractions an experiment varies. */
function fit(
	games: GameData[],
	after: AfterPositions,
	skillCeiling: BetModel['skillCeiling'],
	cheatFractions: number[],
): Fitted {
	const playerGames: PlayerGame[] = games.flatMap((game) => game.players.map((p) => ({ game, parity: p.parity, userId: p.userId, evidence: moveEvidence.gather(game.positions, game.moves, p.parity) }))); // prettier-ignore
	const engineEvidence = playerGames.flatMap((pg) => {
		if (!pg.game.cheat) return [];
		const cheated = simulate.cheat(pg.game, pg.parity, 'full', 0, after, pg.evidence);
		return cheated.missing.length
			? []
			: cheated.evidence.map((e) => ({ gameId: pg.game.gameId, e }));
	});

	const build = (honest: SideFit, engine: SideFit): BetModel => ({
		skillCeiling,
		cheatFractions,
		honestGoodWeights: honest.good,
		honestTopRates: honest.top,
		honestTopMargin: settings.TOP_MARGIN,
		engineGoodWeights: engine.good,
		engineTopWeights: engine.top,
	});
	const honestFolds = Array.from({ length: FOLDS }, (_, f) => fitHonest(playerGames.filter((pg) => foldOf(pg.userId) !== f).flatMap((pg) => pg.evidence))); // prettier-ignore
	const engineFolds = Array.from({ length: FOLDS }, (_, f) => fitEngine(engineEvidence.filter((x) => foldOf(x.gameId) !== f).map((x) => x.e))); // prettier-ignore
	const models = new Map<string, BetModel>();
	const modelFor = (pg: PlayerGame): BetModel => {
		const key = `${foldOf(pg.userId)}/${foldOf(pg.game.gameId)}`;
		let model = models.get(key);
		if (!model) models.set(key, (model = build(honestFolds[foldOf(pg.userId)]!, engineFolds[foldOf(pg.game.gameId)]!))); // prettier-ignore
		return model;
	};

	const byPlayer = new Map<number, PlayerGame[]>();
	for (const pg of playerGames) byPlayer.set(pg.userId, [...(byPlayer.get(pg.userId) ?? []), pg]);
	for (const history of byPlayer.values()) history.sort((a, b) => a.game.date - b.game.date);

	return {
		after,
		playerGames,
		byPlayer,
		modelFor,
		peakScore: (history, from = 0) => peakScore(history, modelFor, from),
		full: build(fitHonest(playerGames.flatMap((pg) => pg.evidence)), fitEngine(engineEvidence.map((x) => x.e))), // prettier-ignore
		engineMoves: engineEvidence.length,
	};
}

/** Honest P(good) weights, and P(top | good) by good-move count, one per line the detector searched. */
function fitHonest(evidence: MoveEvidence[]): SideFit {
	const counts = Array.from({ length: settings.SEARCH.multiPv }, (_, i) => i + 1);
	const top = counts.map((k) => {
		const good = evidence.filter((e) => e.difficulty.goodMoves === k && e.outcome !== 'miss');
		return good.length ? good.filter((e) => e.outcome === 'top').length / good.length : 1;
	});
	return {
		good: logistic.fit(
			featuresOf(evidence),
			evidence.map((e) => isGood(e)),
		),
		top,
	};
}

/** Engine-user P(good) and P(top | good) weights. */
function fitEngine(evidence: MoveEvidence[]): SideFit {
	const good = evidence.filter((e) => e.outcome !== 'miss');
	return {
		good: logistic.fit(
			featuresOf(evidence),
			evidence.map((e) => isGood(e)),
		),
		top: logistic.fit(
			featuresOf(good),
			good.map((e) => (e.outcome === 'top' ? 1 : 0)),
		),
	};
}

/** Each move's model inputs. */
function featuresOf(evidence: MoveEvidence[]): number[][] {
	return evidence.map((e) => bettingScore.features(e.difficulty));
}

/** 1 for a good move (the first line or another), 0 for a miss. */
function isGood(evidence: MoveEvidence): number {
	return evidence.outcome === 'miss' ? 0 : 1;
}

/** A stable fold for an id. */
function foldOf(id: number): number {
	return (((id * 2654435761) ^ ((id * 2654435761) >>> 16)) >>> 0) % FOLDS;
}

// Scoring ---------------------------------------------------------------------

/** See {@link Fitted.peakScore}. */
function peakScore(
	history: Scored[],
	modelFor: (pg: PlayerGame) => BetModel,
	from: number,
): number {
	const ratios = history.map(({ pg, evidence }) => {
		const model = modelFor(pg);
		const player = pg.game.players.find((p) => p.userId === pg.userId)!;
		return bettingScore.gameLogRatios(
			evidence,
			model,
			bettingScore.skillCeiling(model, player.elo, player.rd),
		);
	});
	let best = -Infinity;
	for (let end = Math.max(1, from + 1); end <= history.length; end++) {
		const latest = history[end - 1]!.pg.game.date;
		let start = end;
		while (start > 0 && latest - history[start - 1]!.pg.game.date <= bettingScore.MAX_EVIDENCE_AGE_MS) start--; // prettier-ignore
		best = Math.max(best, bettingScore.bestRunLogScore(ratios.slice(start, end)));
	}
	return best;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	FOLDS,
	// Fitting
	fitCorpus,
	foldOf,
};
