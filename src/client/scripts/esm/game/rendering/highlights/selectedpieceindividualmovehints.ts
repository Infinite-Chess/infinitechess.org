// src/client/scripts/esm/game/rendering/highlights/selectedpieceindividualmovehints.ts

/**
 * This script renders individual legal move hints when the position is in check
 * and our own piece is selected:
 *
 * [Zoomed out] Green entity squares at each individual legal move location.
 * [Zoomed in]  Arrow indicators (via arrows.ts) for off-screen individual legal moves.
 */

import type { Color } from '../../../../../../shared/util/math/math.js';
import type { Coords } from '../../../../../../shared/chess/util/coordutil.js';
import type { LegalMoves } from '../../../../../../shared/chess/logic/legalmoves.js';

import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';

import boardpos from '../boardpos.js';
import gameslot from '../../chess/gameslot.js';
import guipause from '../../gui/guipause.js';
import snapping from './snapping.js';
import selection from '../../chess/selection.js';
import gameloader from '../../chess/gameloader.js';
import preferences from '../../../components/header/preferences.js';
import { GameBus } from '../../GameBus.js';
import squarerendering from './squarerendering.js';

// Variables -----------------------------------------------------------------------

/** The coords of the selected piece that owns the individual moves, or undefined. */
let selectedPieceCoords: Coords | undefined;
/** The individual legal moves to highlight, if conditions are met. Empty otherwise. */
let individualMoves: Coords[] = [];

// Event Listeners ------------------------------------------------------------------

GameBus.addEventListener('piece-selected', (event) => {
	const { legalMoves } = event.detail;
	updateIndividualMoves(legalMoves);
});

GameBus.addEventListener('piece-unselected', () => {
	clearIndividualMoves();
});

// Functions -----------------------------------------------------------------------

/**
 * Updates the list of individual move hints based on the current selection and game state.
 * Only sets moves when our own non-premove piece is selected and the position is in check.
 */
function updateIndividualMoves(legalMoves: LegalMoves): void {
	const gamefile = gameslot.getGamefile()!;
	if (
		selection.isOpponentPieceSelected() ||
		!gameloader.isItOurTurn() ||
		!gamefileutility.isCurrentViewedPositionInCheck(gamefile.boardsim)
	) {
		clearIndividualMoves();
		return;
	}

	individualMoves = legalMoves.individual;
	selectedPieceCoords = selection.getPieceSelected()!.coords;
}

function clearIndividualMoves(): void {
	individualMoves = [];
	selectedPieceCoords = undefined;
}

// Export for snapping.ts ---------------------------------------------------------

/** Returns the coords of the selected piece that owns the individual move hints, or undefined. */
function getPieceCoords(): Coords | undefined {
	return selectedPieceCoords;
}

/** Returns the current list of individual legal move hint squares. */
function getSquares(): Coords[] {
	return individualMoves;
}

// Rendering -----------------------------------------------------------------------

/** [Zoomed out] Renders the individual legal move hint squares as green entity squares. */
function render(): void {
	if (individualMoves.length === 0 || !boardpos.areZoomedOut() || guipause.areWePaused()) return;

	const color_options = {
		isOpponentPiece: false,
		isPremove: false,
	};
	const color: Color = preferences.getLegalMoveHighlightColor(color_options);
	const u_size = snapping.getEntityWidthWorld();
	squarerendering.genModel(individualMoves, color).render(undefined, undefined, { u_size });
}

// Exports -------------------------------------------------------------------------

export default {
	getPieceCoords,
	getSquares,
	render,
};
