// src/shared/chess/game/playability.ts

/**
 * Whether the context asking for an otherwise-legal position can actually start a game from
 * it, judged against the constructed GameFile. Also the single place every refusal — this
 * file's and positionlegality.ts's — becomes text.
 *
 * positionlegality.ts runs first, on the raw position. This runs second, on the board built
 * from it, because these rules need a real board to answer.
 */

import type { GameFile } from '../logic/gamefile.js';
import type { EngineSupportCode } from '../engines/apeironcard.js';
import type { PositionErrorCode } from '../logic/positionlegality.js';
import type { ScriptTranslations } from '../../types/script-translations.js';

import moveutil from '../logic/moveutil.js';
import boardutil from '../logic/boardutil.js';
import gamerules from '../util/gamerules.js';
import checkmate from '../logic/checkmate.js';
import apeironcard from '../engines/apeironcard.js';
import variantmodule from '../logic/variantmodule.js';
import checkdetection from '../logic/checkdetection.js';
import gamefileutility from '../logic/gamefileutility.js';

// Types -----------------------------------------------------------------------

/**
 * Every code keying a flat string under `position_errors`: an illegal position, plus the ways
 * an ICN can be unusable (positionlegality never sees one) and the ways a context can
 * refuse an otherwise-legal position.
 */
type PositionRejectionCode =
	| PositionErrorCode
	| 'invalid_icn'
	| 'icn_missing_position'
	| 'icn_contains_moves'
	| 'moves_invalid'
	| 'king_capture_on_turn_1'
	| 'no_4d_movement'
	| 'game_over'
	| 'player_missing_pieces'
	| 'too_many_royals_for_checkmate';

/**
 * Why a position was refused. Discriminated because the engine's codes key nested objects
 * (`position_errors.engine.<code>`) — {@link localizeRejection} is the only place that matters.
 */
export type PositionRejection =
	| { kind: 'position'; code: PositionRejectionCode }
	| { kind: 'engine'; code: EngineSupportCode };

// Functions -------------------------------------------------------------------

/**
 * Why the given context can't start a game from an otherwise-legal position, or `null` if it can.
 *
 * Checks (in order):
 * 1. Always: under checkmate, the player to move can't capture a royal. No context may load this
 *    — the check/checkmate logic assumes it away, and hits unexpected states when it happens.
 * 2. Seek: no custom piece movement (4D). A seek carries only a position + gamerules, so such a
 *    variant would silently revert to default movement.
 * 3. Seek: the game isn't already over — there'd be nothing left to play.
 * 4. Seek: every player in the turn order has at least one piece. Having no *royal* is fine, even
 *    under a royal-requiring win condition — they simply can't win (e.g. a practice checkmate PvP).
 * 5. Seek: royal count is within what checkmate can afford. Mirrors the cap in
 *    {@link checkmate.isCompatible}.
 * 6. Engine: the position is one the engine can actually handle.
 *
 * A played-out position may break rule 4 while staying perfectly viewable
 * — pieces get captured. So it lives here, not in positionlegality.
 *
 * @param gamefile - MUST be the exact board the game will load: moveless, carrying the real game's
 * world border (apeironborder's play border for engine games). Anything else judges a
 * different game.
 * @param context - Which play contexts to judge it by beyond rule 1. Analysis is neither: it
 * loads finished and engine-unplayable games fine.
 */
function getRejection(
	gamefile: GameFile,
	context: { seek: boolean; engine: boolean },
): PositionRejection | null {
	// --- Rule 1: King capture is not possible on turn 1 ---
	if (gamerules.usesCheckmate(gamefile.gameRules)) {
		// Whoever moves on turn 2 is the one turn 1 could have taken a royal from.
		const secondToMove = moveutil.getWhosTurnAtMoveIndex(gamefile, 0);
		if (checkdetection.detect(gamefile, secondToMove, false).check) {
			return { kind: 'position', code: 'king_capture_on_turn_1' };
		}
	}

	if (context.seek) {
		// --- Rule 2: No custom piece movement ---
		if (variantmodule.hasCustomMovement(gamefile.variant?.mod))
			return { kind: 'position', code: 'no_4d_movement' };

		// --- Rule 3: The game isn't already over ---
		if (gamefileutility.isGameOver(gamefile)) return { kind: 'position', code: 'game_over' };

		// --- Rule 4: Every player has at least one piece ---
		for (const player of gamerules.getUniquePlayersInTurnOrder(gamefile.gameRules.turnOrder)) {
			if (boardutil.getPieceCountOfColor(gamefile.pieces, player) === 0)
				return { kind: 'position', code: 'player_missing_pieces' };
		}

		// --- Rule 5: Royal count is not too high for checkmate ---
		if (
			gamerules.usesCheckmate(gamefile.gameRules) &&
			boardutil.getRoyalCountOfGame(gamefile.pieces) > checkmate.MAX_ROYALS
		) {
			return { kind: 'position', code: 'too_many_royals_for_checkmate' };
		}
	}

	// --- Rule 6: The engine can handle the position ---
	if (context.engine) {
		const support = apeironcard.isPlaySupported(gamefile);
		if (!support.supported) return { kind: 'engine', code: support.reason };
	}
	return null;
}

/** The display text for a rejection, in the language of the given translations. */
function localizeRejection(t: ScriptTranslations, rejection: PositionRejection): string {
	return rejection.kind === 'engine'
		? t.shared.position_errors.engine[rejection.code].message
		: t.shared.position_errors[rejection.code];
}

// Exports ---------------------------------------------------------------------

export default { getRejection, localizeRejection };
