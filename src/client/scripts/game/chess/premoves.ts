// src/client/scripts/game/chess/premoves.ts

/**
 * This script handles the processing and execution of premoves
 * after the opponent's move.
 *
 * Premoves are handled client-side, not server side.
 */

import type { Mesh } from '../../board/rendering/piecemodels.js';
import type { Color } from '../../../../shared/types/color.js';
import type { GameFile } from '../../../../shared/chess/logic/gamefile.js';

import typeutil from '../../../../shared/chess/util/typeutil.js';
import boardutil from '../../../../shared/chess/logic/boardutil.js';
import coordutil from '../../../../shared/util/coordutil.js';
import legalmoves from '../../../../shared/chess/logic/legalmoves.js';
import specialdetect from '../../../../shared/chess/logic/specialdetect.js';
import movepiece, {
	CoordsTagged,
	Edit,
	MoveTagged,
} from '../../../../shared/chess/logic/movepiece.js';

import mouse from '../mouse.js';
import boardpos from '../../board/rendering/boardpos.js';
import gameslot from './gameslot.js';
import selection from './selection.js';
import gamescene from '../rendering/gamescene.js';
import animation from '../../board/rendering/animation/animation.js';
import { MOUSE } from '../input.js';
import preferences from '../../util/preferences.js';
import { GameBus } from '../../board/GameBus.js';
import movesequence from './movesequence.js';
import squarerendering from '../../board/rendering/squarerendering.js';
import { SettingsBus } from '../../util/SettingsBus.js';
import graphicalchanges from '../../board/rendering/graphicalchanges.js';

// Types -----------------------------------------------------------------------

interface Premove extends Edit, MoveTagged {
	/** The type of piece moved */
	type: number;
}

// State -----------------------------------------------------------------------

/** The list of all premoves we currently have, in order. */
let premoves: Premove[] = [];

/**
 * Whether the premoves' board and state changes are applied to the board.
 * Only ever false temporarily, while the real game state is read or changed.
 * True when no premoves are queued.
 */
let applied: boolean = true;

// Events ----------------------------------------------------------------------

GameBus.addEventListener('game-concluded', () => {
	// Erase pending premoves, leaving the `applied` state at what it was before
	// so the rest of the code doesn't experience it changed randomly.

	const originalApplied = applied; // Save the original applied state

	discardPremoves(gameslot.getGamefile()!, gameslot.getMesh());

	// Restore the original applied state, as the rest of the code will have expected it not to change.
	applied = originalApplied;
});
GameBus.addEventListener('game-unloaded', () => {
	clearPremoves();
});

/** Event listener for when we change the Premoves toggle */
SettingsBus.addEventListener('premoves-toggle', () => {
	const gamefile = gameslot.getGamefile();
	const mesh = gameslot.getMesh();

	if (!gamefile) return;

	cancelPremoves(gamefile, mesh);
});

// Processing Premoves ---------------------------------------------------------

/** Whether any premove is pending. */
function hasAtleastOnePremove(): boolean {
	return premoves.length > 0;
}

/** Similar to {@link movesequence.makeMove}: adds a premove and applies its changes to the board. */
function addPremove(gamefile: GameFile, mesh: Mesh | undefined, moveTagged: MoveTagged): Premove {
	if (!applied) throw Error("Don't addPremove when other premoves are not applied!");

	const premove = generatePremove(gamefile, moveTagged);

	applyPremove(gamefile, mesh, premove, true); // Apply the premove to the game state

	premoves.push(premove);

	GameBus.dispatch('physical-move');
	GameBus.dispatch('view-move'); // A physical move also changes the viewed position.

	return premove;
}

/** Applies a premove's changes to the board. */
function applyPremove(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	premove: Premove,
	forward: boolean,
): void {
	movepiece.applyEdit(gamefile, premove, forward);
	if (mesh)
		graphicalchanges.runMeshChanges(gamescene.getGameContext(), gamefile, mesh, premove, forward); // prettier-ignore
}

/** Similar to `movepiece.generateMove`, but generates the edit for a Premove. */
function generatePremove(gamefile: GameFile, moveTagged: MoveTagged): Premove {
	const piece = boardutil.getPieceFromCoords(gamefile.pieces, moveTagged.startCoords);
	if (!piece)
		throw Error(`Cannot generate premove because no piece exists at coords ${JSON.stringify(moveTagged.startCoords)}.`); // prettier-ignore

	// Initialize the state, and change list, as empty for now.
	const premove: Premove = {
		...moveTagged,
		type: piece.type,
		changes: [],
		state: [],
	};

	const rawType = typeutil.getRawType(piece.type);
	let specialMoveMade: boolean = false;
	// If a special move function exists for this piece type, run it.
	// The actual function will return whether a special move was actually made or not.
	// If a special move IS made, we skip the normal move piece method.

	if (rawType in gamefile.specialMoves)
		specialMoveMade = gamefile.specialMoves[rawType]!(gamefile, piece, premove);
	if (!specialMoveMade) movepiece.calcMovesChanges(gamefile, piece, moveTagged, premove); // Move piece regularly (no special tag)

	// Delete all special rights that should be revoked from the move.
	movepiece.queueSpecialRightDeletionStateChanges(gamefile, premove);

	return premove;
}

/** Clears all pending premoves */
function clearPremoves(): void {
	premoves = [];
	// Since we now have zero premoves, they are technically applied.
	applied = true;
}

/** Cancels all premoves */
function cancelPremoves(gamefile: GameFile, mesh?: Mesh): void {
	const hadAtleastOnePremove = hasAtleastOnePremove();

	discardPremoves(gamefile, mesh);

	if (selection.arePremoving()) {
		// Unselect in the case where the premoves are being rewound
		if (hadAtleastOnePremove) selection.unselectPiece();
		// Reselect if we haven't actually made any premoves yet
		else selection.reselectPiece();
	}

	// If there were any animations, this should ensure they're only cancelled if they are for premoves,
	// and not for the opponent's move. After all cancelPremoves() can be called at any time.
	if (hadAtleastOnePremove) animation.clearAnimations(gamescene.getGameContext());
}

/** Unapplies (if applied) and clears all premoves. */
function discardPremoves(gamefile: GameFile, mesh?: Mesh): void {
	const changesBoard = applied && hasAtleastOnePremove();
	if (applied) rewindPremoves(gamefile, mesh);
	clearPremoves();
	if (changesBoard) GameBus.dispatch('view-move');
}

/** Unapplies all pending premoves by undoing their changes on the board. */
function rewindPremoves(gamefile: GameFile, mesh?: Mesh): void {
	if (!applied) throw Error("Don't rewindPremoves when other premoves are not applied!");

	// Reverse the original array so all changes are made in the reverse order they were added
	premoves
		.slice()
		.reverse()
		.forEach((premove) => {
			applyPremove(gamefile, mesh, premove, false); // Apply the premove to the game state backwards
		});

	applied = false;
}

/**
 * Reapplies all pending premoves' changes onto the board.
 *
 * All premove's must be regenerated, as for all we know
 * their destination square could have a new piece, or lack thereof.
 */
function applyPremoves(gamefile: GameFile, mesh?: Mesh): void {
	if (applied) throw Error("Don't applyPremoves when other premoves are already applied!");

	for (let i = 0; i < premoves.length; i++) {
		const oldPremove = premoves[i]!;

		// Check if the premove is still legal to premove
		// It might not be if the premoved piece was captured,
		// Or if a castling premove's rook was captured.
		const results = premoveIsLegal(gamefile, oldPremove, 'premove');

		if (results.legal === true) {
			// Extract the original MoveTagged from the premove
			const premoveTagged: MoveTagged = {
				startCoords: oldPremove.startCoords,
				endCoords: oldPremove.endCoords,
				promotion: oldPremove.promotion,
			};
			specialdetect.transferSpecialTags_FromCoordsToMove(
				results.endCoordsTagged,
				premoveTagged,
			);

			// MUST RECALCULATE CHANGES
			const premove = generatePremove(gamefile, premoveTagged);

			premoves[i] = premove; // Update the premove with the new changes
			applyPremove(gamefile, mesh, premove, true); // Apply the premove to the game state
		} else {
			console.log('Premove is no longer legal:', oldPremove);
			// Premove is no longer legal to premove.
			// This could happen if it was a castling premove, and the rook was captured,
			// so there's no longer a valid rook to premove castle with.

			// Delete this premove and all following premoves
			premoves.splice(i, premoves.length - i);
			break;
		}
	}

	applied = true;

	if (premoves.length === 0) return;

	GameBus.dispatch('physical-move');
	GameBus.dispatch('view-move'); // A physical move also changes the viewed position.
}

/**
 * Processes the premoves array after the opponent's move.
 * Attempts to play the first premove in the list, then applies the remaining premoves.
 * A. Legal => Plays it, submits it, then applies the remaining premoves.
 * B. Illegal => Clears all premoves.
 */
function processPremoves(gamefile: GameFile, mesh?: Mesh): void {
	if (applied)
		throw Error("Don't processPremoves when other premoves are still applied! rewindPremoves() first."); // prettier-ignore

	const premove: Premove | undefined = premoves[0];
	// CAN'T EARLY EXIT if there are no premoves, as
	// we still need clearPremoves() to set applied to true!

	// Check if the move is legal
	const results = premoveIsLegal(gamefile, premove, 'physical');

	if (premove && results.legal === true) {
		// Legal, apply the premove to the real game state

		const moveTagged: MoveTagged = {
			startCoords: premove.startCoords,
			endCoords: premove.endCoords,
			promotion: premove.promotion,
		};
		specialdetect.transferSpecialTags_FromCoordsToMove(results.endCoordsTagged, moveTagged);

		const move = movesequence.makeMove(gamefile, mesh, moveTagged, 'detect');

		GameBus.dispatch('user-move-played');

		premoves.shift(); // Remove premove

		// Only instant animate
		// This also immediately terminates the opponent's move animation
		// MUST READ the move's changes returned from movesequence.makeMove()
		// instead of the premove's changes, as the changes need to be regenerated!
		// prettier-ignore
		graphicalchanges.animateMove(gamescene.getGameContext(), move.changes, true, false, false, true); // true for force instant animation, even secondary pieces aren't animated!

		// Apply remaining premove changes & visuals, but don't make them physically on the board
		applyPremoves(gamefile, mesh);
	} else {
		// Illegal, clear all premoves (they have already been rewound before processPremoves() was called)
		clearPremoves();
	}
}

/**
 * Tests whether a given premove is legal to make on the board.
 * @param mode - Whether to test if the premove is legal to physically play now, or merely still
 *   valid to premove (it stops being one if, e.g., the opponent captures the rook it castles with).
 */
function premoveIsLegal(
	gamefile: GameFile,
	premove: Premove | undefined,
	mode: 'physical' | 'premove',
): { legal: true; endCoordsTagged: CoordsTagged } | { legal: false } {
	if (!premove) return { legal: false };

	const piece = boardutil.getPieceFromCoords(gamefile.pieces, premove.startCoords);
	if (!piece) return { legal: false }; // Can't premove nothing, could happen if your piece was captured by enpassant

	if (premove.type !== piece.type) return { legal: false }; // Our piece was probably captured, so it can't move anymore, thus the premove is illegal.

	// Check if the move is legal
	const premovedPieceLegalMoves =
		mode === 'physical'
			? legalmoves.calculateAll(gamefile, piece)
			: legalmoves.calculateAllPremoves(gamefile, piece);
	const color = typeutil.getColorFromType(piece.type);

	// A copy of the end coords for applying the special tags too.
	// We have to do this because enpassant capture tags aren't
	// generated for normal premoves
	const endCoordsTagged: CoordsTagged = coordutil.copyCoords(premove.endCoords);

	const isLegal = legalmoves.checkIfMoveLegal(
		gamefile,
		premovedPieceLegalMoves,
		premove.startCoords,
		endCoordsTagged,
		color,
	);

	if (isLegal) return { legal: true, endCoordsTagged };
	else return { legal: false };
}

/**
 * Executes a callback function with all premoves rewound, so the game state is correct for any board checks.
 * Then depending on the return value, may attempt to physically play the next premove when re-applying them.
 * @param callback - A function that returns true if we should attempt to physically play our next premove when re-applying them.
 */
function performWithUnapplied(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	callback: () => boolean,
): void {
	// Rewind all to get the real game state
	rewindPremoves(gamefile, mesh);

	const result = callback();

	if (result) {
		// Attempt to physically make our next premove, and re-apply the remaining.
		processPremoves(gamefile, mesh);
	} else {
		// Just re-apply
		applyPremoves(gamefile, mesh);
	}
}

/** Returns the result of reading the board with all premoves unapplied, restoring them afterward. */
function readUnapplied<T>(gamefile: GameFile, read: () => T): T {
	if (!applied) return read(); // Reached by listeners of a move made within performWithUnapplied()

	rewindPremoves(gamefile);
	const result = read();
	// A read leaves the board untouched, so the premoves' existing changes still apply.
	for (const premove of premoves) applyPremove(gamefile, undefined, premove, true);
	applied = true;

	return result;
}

// Updating Premoves -----------------------------------------------------------

/** Clears premoves if right mouse is down and Lingering Annotations mode is off. */
function update(gamefile: GameFile, mesh?: Mesh): void {
	if (preferences.getLingeringAnnotationsMode()) return; // Right mouse down doesn't clear premoves in Lingering Annotations mode

	if (mouse.isMouseDown(MOUSE.RIGHT)) {
		if (!hasAtleastOnePremove()) return; // No premoves to clear. Don't claim the right mouse button.

		mouse.claimMouseDown(MOUSE.RIGHT); // Claim the right mouse button so it doesn't propagate to arrow drawing
		mouse.cancelMouseClick(MOUSE.RIGHT); // Prevents the up-release from registering a click later, drawing a square highlight

		cancelPremoves(gamefile, mesh);
	}
}

// Rendering -------------------------------------------------------------------

/** Renders the premoves */
function render(): void {
	if (premoves.length === 0) return; // No premoves to render

	let premoveSquares = premoves.flatMap((p) => [p.startCoords, p.endCoords]);

	// De-duplicate the squares
	premoveSquares = premoveSquares.filter((coords, index, self) => {
		return self.findIndex((c) => coordutil.areCoordsEqual(c, coords)) === index;
	});

	const u_size: number = boardpos.getBoardScaleAsNumber();
	const color: Color = preferences.getAnnoteSquareColor();

	// Render preset squares
	squarerendering
		.genModel(gamescene.getGameContext(), premoveSquares, color)
		.render(undefined, undefined, { u_size });
}

// Exports ---------------------------------------------------------------------

export default {
	hasAtleastOnePremove,
	addPremove,
	cancelPremoves,
	performWithUnapplied,
	readUnapplied,
	update,
	render,
};
