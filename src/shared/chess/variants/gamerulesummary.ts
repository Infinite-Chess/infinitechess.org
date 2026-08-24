// src/shared/chess/variants/gamerulesummary.ts

/**
 * Summarizes how a game's rules differ from the standard ones, as a list of short
 * sentences — "Black moves first.", "No promotion.", "No 50-move rule.".
 *
 * Returns data. Both sides render the one summary their own way:
 * the client's variant preview tooltip builds DOM from it, the game page SSRs HTML.
 */

import type { GameRules } from '../util/gamerules.js';
import type { VariantCode } from '../util/variantcodes.js';
import type { GameModifier } from '../../util/modutil.js';
import type { GlobalGameState } from '../logic/state.js';
import type { ScriptTranslations } from '../../types/script-translations.js';
import type { GameruleWinCondition } from '../util/winconutil.js';

import modutil from '../../util/modutil.js';
import pieceThemes from '../util/pieceThemes.js';
import variantregistry from './variantregistry.js';
import typeutil, { Player, RawType, players } from '../../util/typeutil.js';
import { interpolate, splitAroundPlaceholder } from '../../util/interpolate.js';

// Types --------------------------------------------------------------------

/** One line of a rule summary. */
export type RuleSummaryItem =
	/** A finished sentence, ready to print as-is. */
	| { kind: 'text'; text: string }
	/**
	 * The pieces a pawn may promote to, drawn as icons rather than named. Renders as `prefix`,
	 * then one icon per piece, then `suffix`. Every piece listed is guaranteed to have an svg.
	 */
	| { kind: 'promotion'; prefix: string; pieces: RawType[]; suffix: string };

// Functions ----------------------------------------------------------------

/**
 * Lists every way a game's rules depart from the standard ones, in reading order.
 * An empty list means the game plays entirely by the defaults.
 * @param state_global - The position's starting global state. Absent for a preset
 * variant, which never starts mid-game with an en passant square or ply count.
 * @param variantCode - Undefined for a custom position, which has no variant.
 */
export function summarizeGameRules(
	gameRules: GameRules,
	state_global: GlobalGameState | undefined,
	variantCode: VariantCode | undefined,
	modifiers: GameModifier[] | undefined,
	sharedT: ScriptTranslations['shared'],
): RuleSummaryItem[] {
	const items: RuleSummaryItem[] = [];
	/** Reference to the variant preview translations. */
	const tp = sharedT.variant_preview;

	/** Appends a finished sentence. */
	const pushText = (text: string): number => items.push({ kind: 'text', text });

	// 4D movement — first
	if (variantCode !== undefined && variantregistry.getVariantGroup(variantCode) === '4D') {
		pushText(tp.four_d_movement);
	}

	// Turn order — show if not standard [White, Black]
	const defaultTurnOrder = [players.WHITE, players.BLACK];
	const blackFirstTurnOrder = [players.BLACK, players.WHITE];
	const turnOrderIsDefault = matchesTurnOrder(gameRules, defaultTurnOrder);
	if (!turnOrderIsDefault) {
		const isBlackFirst = matchesTurnOrder(gameRules, blackFirstTurnOrder);
		if (isBlackFirst) {
			pushText(tp.black_moves_first);
		} else {
			const order = gameRules.turnOrder.map((p) => sharedT.sides[typeutil.strcolors[p]]).join(', '); // prettier-ignore
			pushText(interpolate(tp.turn_order, { order }));
		}
	}

	// Win conditions — show if not all checkmate
	const allCheckmate = Object.values(gameRules.winConditions).every(
		(conds) => conds.length === 1 && conds[0] === 'checkmate',
	);
	if (!allCheckmate) {
		const playerCount = Object.keys(gameRules.winConditions).length;
		// Map each non-checkmate win condition to the list of players that have it
		const condToPlayers = new Map<GameruleWinCondition, Player[]>();
		for (const [playerStr, conds] of Object.entries(gameRules.winConditions)) {
			const player = Number(playerStr) as Player;
			for (const cond of conds) {
				if (!condToPlayers.has(cond)) condToPlayers.set(cond, []);
				condToPlayers.get(cond)!.push(player);
			}
		}
		for (const [cond, condPlayers] of condToPlayers) {
			const label = sharedT.conditions[cond] ?? cond;
			if (condPlayers.length === playerCount) {
				// All players share this win condition
				pushText(interpolate(tp.win_by, { label }));
			} else {
				// Only specific players have this win condition
				for (const player of condPlayers) {
					const color = typeutil.strcolors[player];
					pushText(interpolate(sharedT.game_result.color_wins_by, { color: sharedT.sides[color], label })); // prettier-ignore
				}
			}
		}
	}

	// Promotion — for preset variants, skip when promotion is defined (pieces are
	// always explicitly set and don't need enumerating); still show "No promotion"
	// when absent. For custom positions, always show the full promotion info.
	if (gameRules.promotion === undefined) {
		pushText(tp.no_promotion);
	} else if (variantCode === undefined) {
		// Only pieces that have an svg can be drawn. A promotion list may still name one that doesn't
		// (a void): validation refuses such a position, but it is previewed anyway while being typed.
		const pieces = gameRules.promotion.pieces.filter(
			(raw) => !pieceThemes.SVGLESS_TYPES.has(raw),
		);
		if (pieces.length > 0) {
			// The icons sit mid-sentence, so the line is split around the
			// placeholder standing in for them rather than interpolated.
			const [prefix, suffix] = splitAroundPlaceholder(tp.promotion_rule, 'pieces');
			items.push({ kind: 'promotion', prefix, pieces, suffix });
		}
	}

	// Move rule — show if not default (100)
	if (gameRules.moveRule !== 100) {
		if (gameRules.moveRule === undefined) pushText(tp.no_move_rule);
		else pushText(interpolate(tp.move_rule, { plies: gameRules.moveRule }));
	}

	// Slide limit gamerule - SKIP. Covered below as a modifier.
	// Plus, currently the modifier isn't transferred to variant preview gameRules.

	// Game state: enpassant square
	const enpassant = state_global?.enpassant;
	if (enpassant !== undefined) {
		const [x, y] = enpassant.square;
		pushText(interpolate(tp.en_passant, { x: String(x), y: String(y) }));
	}

	// Game state: move rule counter
	const moveRuleState = state_global?.moveRuleState;
	if (moveRuleState !== undefined && moveRuleState !== 0) {
		pushText(interpolate(tp.plies_since_capture, { n: moveRuleState }));
	}

	// Modifiers — last
	for (const modifier of modifiers ?? []) {
		if (modifier.kind === 'slide-limit') {
			const descVars = modutil.getModifierDescriptionVars(modifier);
			pushText(interpolate(tp.slide_limit_rule, descVars));
		} else {
			throw new Error(`Unknown modifier kind ${modifier.kind}`);
		}
	}

	return items;
}

/** Whether the turn order in gameRules matches the given order. */
function matchesTurnOrder(gameRules: GameRules, order: Player[]): boolean {
	return (
		gameRules.turnOrder.length === order.length &&
		gameRules.turnOrder.every((p, i) => p === order[i])
	);
}
