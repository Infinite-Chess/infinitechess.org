// src/client/scripts/esm/board/rendering/glyphs/conclusionglyphs.ts

/**
 * Renders the game-end glyph (lichess's) of the conclusion the viewed position reached: on the
 * loser's royals for a win, or every side's royals for a draw. Wins by capture mark the square of
 * the final capture instead, since the loser's last royal or piece is gone.
 */

import type { Glyph } from './boardglyphs.js';
import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { Condition } from '../../../../../../shared/chess/util/winconutil.js';
import type RenderContext from '../RenderContext.js';
import type { GameConclusion } from '../../../../../../shared/chess/util/typeschemas.js';

import moveutil from '../../../../../../shared/chess/logic/moveutil.js';
import boardutil from '../../../../../../shared/chess/logic/boardutil.js';
import gamerules from '../../../../../../shared/chess/util/gamerules.js';

import boardglyphs from './boardglyphs.js';

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

// Rendering -------------------------------------------------------------------

/** Renders the glyph of the conclusion the viewed position reached. */
function render(ctx: RenderContext, gamefile: GameFile, conclusion: GameConclusion): void {
	const glyph = CONCLUSION_GLYPHS[conclusion.condition];
	if (glyph) boardglyphs.render(ctx, glyph, getGlyphSquares(gamefile, conclusion));
}

/** The squares a conclusion's glyph marks. */
function getGlyphSquares(gamefile: GameFile, conclusion: GameConclusion): Coords[] {
	if (CAPTURE_CONDITIONS.includes(conclusion.condition)) {
		const viewedMove = moveutil.getCurrentMove(gamefile);
		return viewedMove ? [viewedMove.endCoords] : []; // A pasted, already-concluded game may have no moves.
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
