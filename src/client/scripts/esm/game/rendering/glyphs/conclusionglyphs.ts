// src/client/scripts/esm/game/rendering/glyphs/conclusionglyphs.ts

/**
 * Renders the game-end glyph (lichess's) while the concluded game's final position is viewed: on
 * the loser's royals for a win, or every side's royals for a draw. Wins by capture mark the square
 * of the final capture instead, since the loser's last royal or piece is gone.
 */

import type { Glyph } from './boardglyphs.js';
import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { Condition } from '../../../../../../shared/chess/util/winconutil.js';
import type { GameConclusion } from '../../../../../../shared/chess/util/typeschemas.js';

import moveutil from '../../../../../../shared/chess/logic/moveutil.js';
import boardutil from '../../../../../../shared/chess/logic/boardutil.js';
import gamerules from '../../../../../../shared/chess/util/gamerules.js';

import boardglyphs from './boardglyphs.js';
import { GameBus } from '../../../board/GameBus.js';
import frametracker from '../../../board/rendering/frametracker.js';

// Constants -------------------------------------------------------------------

/** The glyph each conclusion shows. Aborted games show none. */
const CONCLUSION_GLYPHS: Record<Condition, Glyph | undefined> = {
	checkmate: 'mate',
	royalcapture: 'unknown',
	allroyalscaptured: 'unknown',
	allpiecescaptured: 'unknown',
	koth: 'unknown',
	time: 'outoftime',
	resignation: 'resign',
	disconnect: 'abandoned',
	stalemate: 'stalemate',
	moverule: 'draw',
	repetition: 'draw',
	insuffmat: 'draw',
	agreement: 'draw',
	abandonment: 'draw',
	aborted: undefined,
};

/** Wins whose final move captured what the glyph would otherwise mark. */
const CAPTURE_CONDITIONS: Condition[] = ['royalcapture', 'allroyalscaptured', 'allpiecescaptured'];

// Init ------------------------------------------------------------------------

// Load-bearing: a resignation, flag or disconnect concludes the game without any move to redraw.
GameBus.addEventListener('game-concluded', () => frametracker.onVisualChange());

// Rendering -------------------------------------------------------------------

/** Renders the conclusion's glyph, if the game has ended and its final position is in view. */
function render(gamefile: GameFile): void {
	const conclusion = gamefile.gameConclusion;
	if (!conclusion || !moveutil.areWeViewingLatestMove(gamefile)) return;

	const glyph = CONCLUSION_GLYPHS[conclusion.condition];
	if (glyph) boardglyphs.render(glyph, getGlyphSquares(gamefile, conclusion));
}

/** The squares a conclusion's glyph marks. */
function getGlyphSquares(gamefile: GameFile, conclusion: GameConclusion): Coords[] {
	if (CAPTURE_CONDITIONS.includes(conclusion.condition)) {
		const lastMove = moveutil.getLastMove(gamefile.moves);
		return lastMove ? [lastMove.endCoords] : []; // A pasted, already-concluded game may have no moves.
	}

	const players = gamerules.getUniquePlayersInTurnOrder(gamefile.gameRules.turnOrder);
	const marked =
		conclusion.victor === null ? players : players.filter((p) => p !== conclusion.victor);
	return marked.flatMap((p) => boardutil.getRoyalCoordsOfColor(gamefile.pieces, p));
}

// Exports ---------------------------------------------------------------------

export default {
	render,
};
