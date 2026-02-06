// src/client/scripts/esm/game/chess/premoves.ts

/**
 * This script handles the processing and execution of premoves
 * after the opponent's move.
 *
 * Premoves are handled client-side, not server side.
 */

import type { Mesh } from '../rendering/piecemodels.js';
import type { Color } from '../../../../../shared/util/math/math.js';
import type { FullGame } from '../../../../../shared/chess/logic/gamefile.js';

import mouse from '../../util/mouse.js';
import typeutil from '../../../../../shared/chess/util/typeutil.js';
import boardpos from '../rendering/boardpos.js';
import gameslot from './gameslot.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import coordutil from '../../../../../shared/chess/util/coordutil.js';
import selection from './selection.js';
import animation from '../rendering/animation.js';
import { Mouse } from '../input.js';
import legalmoves from '../../../../../shared/chess/logic/legalmoves.js';
import preferences from '../../components/header/preferences.js';
import { GameBus } from '../GameBus.js';
import movesequence from './movesequence.js';
import specialdetect from '../../../../../shared/chess/logic/specialdetect.js';
import squarerendering from '../rendering/highlights/squarerendering.js';
import { animateMove } from './graphicalchanges.js';
import movepiece, {
	CoordsSpecial,
	Edit,
	MoveDraft,
} from '../../../../../shared/chess/logic/movepiece.js';

// Type Definitions ---------------------------------------------

interface Premove extends Edit, MoveDraft {
	/** The type of piece moved */
	type: number;
}

// Variables ----------------------------------------------------

/** The list of all premoves we currently have, in order. */
let premoves: Premove[] = [];

/**
 * Whether the premoves board and state changes have been applied to the board.
 * This is purely for DEBUGGING so you don't accidentally call these
 * methods at the wrong times.
 *
 * When premove's changes have to be reapplied, we have to recalculate all
 * of their changes, since for all we know they could end up capturing a
 * piece when they didn't when we originally premoved, or vice versa.
 *
 * THIS SHOULD ONLY TEMPORARILY ever be false!! If it is, it means we just
 * need to do something like calculating legal moves, then reapply the premoves.
 *
 * This can even be true when there's no premoves queued.
 */
let applied: boolean = true;

// Events ----------------------------------------------------------------------------------

GameBus.addEventListener('game-concluded', () => {
	// console.error("Game ended, clearing premoves");

	// Erase pending premoves, leaving the `applied` state at what it was before
	// so the rest of the code doesn't experience it changed randomly.

	const originalApplied = applied; // Save the original applied state

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	if (applied) rewindPremoves(gamefile, mesh);
	clearPremoves();

	// Restore the original applied state, as the rest of the code will have expected it not to change.
	applied = originalApplied;
});
GameBus.addEventListener('game-unloaded', () => {
	clearPremoves();
});

/** Event listener for when we change the Premoves toggle */
document.addEventListener('premoves-toggle', (_e) => {
	// const enabled: boolean = _e.detail;

	const gamefile = gameslot.getGamefile();
	const mesh = gameslot.getMesh();

	if (!gamefile) return;

	cancelPremoves(gamefile, mesh);
});

// Processing Premoves ---------------------------------------------------------------------

/** Gets all pending premoves. */
function hasAtleastOnePremove(): boolean {
	return premoves.length > 0;
}

/** Whether premove board changes are applied (can be true even when there's zero queued premoves) */
function arePremovesApplied(): boolean {
	return applied;
}

/** Similar to {@link movesequence.makeMove} Adds an premove and applies its changes to the board. */
function addPremove(gamefile: FullGame, mesh: Mesh | undefined, moveDraft: MoveDraft): Premove {
	// console.log("Adding premove");

	if (!applied) throw Error("Don't addPremove when other premoves are not applied!");

	const premove = generatePremove(gamefile, moveDraft);

	applyPremove(gamefile, mesh, premove, true); // Apply the premove to the game state

	premoves.push(premove);
	// console.log(premoves);

	GameBus.dispatch('physical-move');

	return premove;
}

/** Applies a premove's changes to the board. */
function applyPremove(
	gamefile: FullGame,
	mesh: Mesh | undefined,
	premove: Premove,
	forward: boolean,
): void {
	// console.log(`Applying premove ${forward ? 'FORWARD' : 'BACKWARD'}:`, premove);
	movepiece.applyEdit(gamefile, premove, forward, true); // forward & global are true
	if (mesh) movesequence.runMeshChanges(gamefile.boardsim, mesh, premove, forward);
}

/** Similar to {@link movepiece.generateMove}, but generates the edit for a Premove. */
function generatePremove(gamefile: FullGame, moveDraft: MoveDraft): Premove {
	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, moveDraft.startCoords);
	if (!piece)
		throw Error(
			`Cannot generate premove because no piece exists at coords ${JSON.stringify(moveDraft.startCoords)}.`,
		);

	// Initialize the state, and change list, as empty for now.
	const premove: Premove = {
		...moveDraft,
		type: piece.type,
		changes: [],
		state: { local: [], global: [] },
	};

	const rawType = typeutil.getRawType(piece.type);
	let specialMoveMade: boolean = false;
	// If a special move function exists for this piece type, run it.
	// The actual function will return whether a special move was actually made or not.
	// If a special move IS made, we skip the normal move piece method.

	if (rawType in gamefile.boardsim.specialMoves)
		specialMoveMade = gamefile.boardsim.specialMoves[rawType]!(
			gamefile.boardsim,
			piece,
			premove,
		);
	if (!specialMoveMade) movepiece.calcMovesChanges(gamefile.boardsim, piece, moveDraft, premove); // Move piece regularly (no special tag)

	// Delete all special rights that should be revoked from the move.
	movepiece.queueSpecialRightDeletionStateChanges(gamefile.boardsim, premove);

	return premove;
}

/** Clears all pending premoves */
function clearPremoves(): void {
	// console.error("Clearing premoves");
	premoves = [];
	// Since we now have zero premoves, they are technically applied.
	// console.error("Setting applied to true.");
	applied = true;
}

/** Cancels all premoves */
function cancelPremoves(gamefile: FullGame, mesh?: Mesh): void {
	// console.log("Clearing premoves");
	const hadAtleastOnePremove = hasAtleastOnePremove();

	rewindPremoves(gamefile, mesh);
	clearPremoves();

	if (selection.arePremoving()) {
		// Unselect in the case where the premoves are being rewound
		if (hadAtleastOnePremove) selection.unselectPiece();
		// Reselect if we haven't actually made any premoves yet
		else selection.reselectPiece();
	}

	// If there were any animations, this should ensure they're only cancelled if they are for premoves,
	// and not for the opponent's move. After all cancelPremoves() can be called at any time.
	if (hadAtleastOnePremove) animation.clearAnimations();
}

/** Unapplies all pending premoves by undoing their changes on the board. */
function rewindPremoves(gamefile: FullGame, mesh?: Mesh): void {
	if (!applied) throw Error("Don't rewindPremoves when other premoves are not applied!");

	// Reverse the original array so all changes are made in the reverse order they were added
	premoves
		.slice()
		.reverse()
		.forEach((premove) => {
			applyPremove(gamefile, mesh, premove, false); // Apply the premove to the game state backwards
		});

	// console.error("Setting applied to false.");
	applied = false;
}

/**
 * Reapplies all pending premoves' changes onto the board.
 *
 * All premove's must be regenerated, as for all we know
 * their destination square could have a new piece, or lack thereof.
 */
function applyPremoves(gamefile: FullGame, mesh?: Mesh): void {
	if (applied) throw Error("Don't applyPremoves when other premoves are already applied!");

	for (let i = 0; i < premoves.length; i++) {
		const oldPremove = premoves[i]!;

		// Check if the premove is still legal to premove
		// It might not be if the premoved piece was captured,
		// Or if a castling premove's rook was captured.
		const results = premoveIsLegal(gamefile, oldPremove, 'premove');

		if (results.legal === true) {
			// Extract the original MoveDraft from the premove
			const premoveDraft: MoveDraft = {
				startCoords: oldPremove.startCoords,
				endCoords: oldPremove.endCoords,
				promotion: oldPremove.promotion,
			};
			specialdetect.transferSpecialFlags_FromCoordsToMove(
				results.endCoordsSpecial,
				premoveDraft,
			);

			// MUST RECALCULATE CHANGES
			const premove = generatePremove(gamefile, premoveDraft);

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

	// console.error("Setting applied to true.");
	applied = true;

	GameBus.dispatch('physical-move');
}

/**
 * Processes the premoves array after the opponent's move.
 * Attempts to play the first premove in the list, then applies the remaining premoves.
 * A. Legal => Plays it, submits it, then applies the remaining premoves.
 * B. Illegal => Clears all premoves.
 */
function processPremoves(gamefile: FullGame, mesh?: Mesh): void {
	// console.error("Processing premoves");

	if (applied)
		throw Error(
			"Don't processPremoves when other premoves are still applied! rewindPremoves() first.",
		);

	const premove: Premove | undefined = premoves[0];
	// CAN'T EARLY EXIT if there are no premoves, as
	// we still need clearPremoves() to set applied to true!

	// Check if the move is legal
	const results = premoveIsLegal(gamefile, premove, 'physical');

	if (premove && results.legal === true) {
		// console.log("Premove is legal, applying it");

		// Legal, apply the premove to the real game state

		const moveDraft: MoveDraft = {
			startCoords: premove.startCoords,
			endCoords: premove.endCoords,
			promotion: premove.promotion,
		};
		specialdetect.transferSpecialFlags_FromCoordsToMove(results.endCoordsSpecial, moveDraft);

		const move = movesequence.makeMove(gamefile, mesh, moveDraft); // Make move

		GameBus.dispatch('user-move-played');

		premoves.shift(); // Remove premove

		// Only instant animate
		// This also immediately terminates the opponent's move animation
		// MUST READ the move's changes returned from movesequence.makeMove()
		// instead of the premove's changes, as the changes need to be regenerated!
		animateMove(move.changes, true, false, false, true); // true for force instant animation, even secondary pieces aren't animated!

		// Apply remaining premove changes & visuals, but don't make them physically on the board
		applyPremoves(gamefile, mesh);
	} else {
		// console.log("Premove is illegal, clearing all premoves");
		// Illegal, clear all premoves (they have already been rewounded before processPremoves() was called)
		clearPremoves();
	}
}

/**
 * Tests whether a given premove is legal to make on the board.
 * @param gamefile
 * @param premove
 * @param mode - Whether we should be testing if the premove is legal to make physically in the game, OR if it's still a valid premove to PREMOVE. A premove may no longer become a valid premove if for example the castling opportunity dissapears due to the opponent capturing the rook.
 * @returns
 */
function premoveIsLegal(
	gamefile: FullGame,
	premove: Premove | undefined,
	mode: 'physical' | 'premove',
): { legal: true; endCoordsSpecial: CoordsSpecial } | { legal: false } {
	if (!premove) return { legal: false };

	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, premove.startCoords);
	if (!piece) return { legal: false }; // Can't premove nothing, could happen if your piece was captured by enpassant

	if (premove.type !== piece.type) return { legal: false }; // Our piece was probably captured, so it can't move anymore, thus the premove is illegal.

	// Check if the move is legal
	const premovedPieceLegalMoves =
		mode === 'physical'
			? legalmoves.calculateAll(gamefile, piece)
			: legalmoves.calculateAllPremoves(gamefile, piece);
	const color = typeutil.getColorFromType(piece.type);

	// A copy of the end coords for applying the special flags too.
	// We have to do this because enpassant capture flags aren't
	// generated for normal premoves
	const endCoordsSpecial: CoordsSpecial = coordutil.copyCoords(premove.endCoords);

	const isLegal = legalmoves.checkIfMoveLegal(
		gamefile,
		premovedPieceLegalMoves,
		premove.startCoords,
		endCoordsSpecial,
		color,
	);

	if (isLegal || selection.getEditMode()) return { legal: true, endCoordsSpecial };
	else return { legal: false };
}

/**
 * Called externally when its our move in the game.
 *
 * Shouldn't care whether the game is over, as all premoves should have been cleared,
 * and not to mention we still need applied to be set to true.
 *
 * Similar to {@link applyPremoves}, but before applying premoves, it attempts to play the first premove in the list if legal.
 */
function onYourMove(gamefile: FullGame, mesh?: Mesh): void {
	// Process the next premove, will reapply the premoves
	processPremoves(gamefile, mesh);
}

// Updating Premoves ------------------------------------------------

/** Clears premoves if right mouse is down and Lingering Annotations mode is off. */
function update(gamefile: FullGame, mesh?: Mesh): void {
	if (preferences.getLingeringAnnotationsMode()) return; // Right mouse down doesn't clear premoves in Lingering Annotations mode

	if (mouse.isMouseDown(Mouse.RIGHT)) {
		if (!hasAtleastOnePremove()) return; // No premoves to clear. Don't claim the right mouse button.

		mouse.claimMouseDown(Mouse.RIGHT); // Claim the right mouse button so it doesn't propagate to arrow drawing
		mouse.cancelMouseClick(Mouse.RIGHT); // Prevents the up-release from registering a click later, drawing a square highlight

		cancelPremoves(gamefile, mesh);
	}
}

// Rendering --------------------------------------------------------

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
	squarerendering.genModel(premoveSquares, color).render(undefined, undefined, { u_size });
}

// Exports ------------------------------------------------

export default {
	hasAtleastOnePremove,
	arePremovesApplied,
	addPremove,
	cancelPremoves,
	rewindPremoves,
	applyPremoves,
	onYourMove,
	update,
	render,
};
