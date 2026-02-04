// src/client/scripts/esm/game/boardeditor/tools/normaltool.ts

/**
 * Normal Tool for the Board Editor
 *
 * This tool can drag pieces around.
 */

import type { Mesh } from '../../rendering/piecemodels';
import type { Edit } from '../boardeditor';
import type { _Move_Compact } from '../../../../../../shared/chess/logic/icn/icnconverter';
import type { Board, FullGame } from '../../../../../../shared/chess/logic/gamefile';

import state from '../../../../../../shared/chess/logic/state';
import movepiece from '../../../../../../shared/chess/logic/movepiece';
import boardutil from '../../../../../../shared/chess/util/boardutil';
import coordutil from '../../../../../../shared/chess/util/coordutil';
import boardeditor from '../boardeditor';
import movesequence from '../../chess/movesequence';
import { GameBus } from '../../GameBus';

// Making Move Edits in the Game ---------------------------------------------

/**
 * Similar to {@link movesequence.makeMove}, but doesn't push the move to the game's
 * moves list, nor update gui, clocks, or do game over checks, nor the moveIndex property updated.
 */
function makeMoveEdit(gamefile: FullGame, mesh: Mesh | undefined, moveDraft: _Move_Compact): Edit {
	const edit = generateMoveEdit(gamefile.boardsim, moveDraft);

	movepiece.applyEdit(gamefile, edit, true, true); // forward & global are always true
	GameBus.dispatch('physical-move');

	if (mesh) movesequence.runMeshChanges(gamefile.boardsim, mesh, edit, true);

	boardeditor.addEditToHistory(edit);

	return edit;
}

/**
 * Similar to {@link movepiece.generateMove}, but specifically for editor moves,
 * which don't execute special moves, nor are appeneded to the game's moves list,
 * nor the gamefile's moveIndex property updated.
 */
function generateMoveEdit(boardsim: Board, moveDraft: _Move_Compact): Edit {
	const piece = boardutil.getPieceFromCoords(boardsim.pieces, moveDraft.startCoords);
	if (!piece)
		throw Error(
			`Cannot generate move edit because no piece exists at coords ${JSON.stringify(moveDraft.startCoords)}.`,
		);

	// Initialize the state, and change list, as empty for now.
	const edit: Edit = {
		changes: [],
		state: { local: [], global: [] },
	};

	movepiece.calcMovesChanges(boardsim, piece, moveDraft, edit); // Move piece regularly (no specials)

	// Queue the state change transfer of this edit's special right to its new destination.
	const startCoordsKey = coordutil.getKeyFromCoords(moveDraft.startCoords);
	const endCoordsKey = coordutil.getKeyFromCoords(moveDraft.endCoords);
	const hasSpecialRight = boardsim.state.global.specialRights.has(startCoordsKey);
	const destinationHasSpecialRight = boardsim.state.global.specialRights.has(endCoordsKey);
	state.createSpecialRightsState(edit, startCoordsKey, hasSpecialRight, false); // Delete the special right from the startCoords, if it exists
	state.createSpecialRightsState(edit, endCoordsKey, destinationHasSpecialRight, hasSpecialRight); // Transfer the special right to the endCoords, if it exists

	return edit;
}

// Exports --------------------------------------------------------------------

export default {
	makeMoveEdit,
};
