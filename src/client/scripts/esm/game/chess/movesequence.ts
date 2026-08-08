// src/client/scripts/esm/game/chess/movesequence.ts

/**
 * This is a client-side script that executes global and local moves,
 * making both the logical, and graphical changes.
 *
 * We also have the animate move method here.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { Edit, MoveFull, MoveTagged } from '../../../../../shared/chess/logic/movepiece.js';

import moveutil from '../../../../../shared/chess/util/moveutil.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';
import wincondition from '../../../../../shared/chess/logic/wincondition.js';
import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';

import gamecore from './gamecore.js';
import gameslot from './gameslot.js';
import { Mesh } from '../rendering/piecemodels.js';
import premoves from './premoves.js';
import animation from '../rendering/animation.js';
import piecemodels from '../rendering/piecemodels.js';
import { GameBus } from '../GameBus.js';
import gamesession from './gamesession.js';
import frametracker from '../rendering/frametracker.js';
import { animateMove, meshChanges } from './graphicalchanges.js';

// Global Moving ----------------------------------------------------------------------------------------------------------

/**
 * Commits a global forward move to the game: all logical, game-state,
 * clock, and move-list GUI changes — but NO piece-mesh update.
 */
function commitMove(
	gamefile: GameFile,
	moveTagged: MoveTagged,
	{ doGameOverChecks = true }: { doGameOverChecks?: boolean } = {},
): MoveFull {
	const move = movepiece.generateMove(gamefile, moveTagged);

	movepiece.makeMove(gamefile, move); // Logical changes

	// Must run ABOVE 'moves-changed': the checks flag a checkmating move as mate, and the
	// move list renders each ply's notation (# vs +) once, from the flags it sees then.
	if (doGameOverChecks) wincondition.doGameOverChecks(gamefile);

	// Forward chokepoint for the committed move list.
	GameBus.dispatch('moves-changed');

	// Must stay BELOW 'moves-changed': the reconcile it triggers has to enqueue before
	// 'game-concluded's scroll-to-bottom, so the final ply exists when we scroll.
	if (
		doGameOverChecks &&
		gamefileutility.isGameOver(gamefile) &&
		// Only conclude the game if it's not an online game (in that scenario, server is boss)
		gamesession.getGameType() !== 'online' &&
		gamesession.getGameType() !== 'analysis'
	) {
		gameslot.concludeGame();
	}

	GameBus.dispatch('physical-move');

	return move;
}

/** Makes a global forward move in the game and syncs the mesh to it. Does not animate. */
function makeMove(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	moveTagged: MoveTagged,
	options: { doGameOverChecks?: boolean } = {},
): MoveFull {
	const move = commitMove(gamefile, moveTagged, options);
	if (mesh) runMeshChanges(gamefile, mesh, move, true);
	GameBus.dispatch('view-move'); // Committing a move at the front also advances the viewed position.
	GameBus.dispatch('view-front'); // ...to the new front, so the moves panel follows it.
	return move;
}

/**
 * Makes a global forward move WITHOUT changing which move we're viewing, and without animating.
 * The logical board is temporarily fast-forwarded to the front to append the move (updating
 * game state, clocks, and the move-list GUI), then rewound to the move we're viewing.
 */
function makeMoveKeepingView(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	moveTagged: MoveTagged,
): MoveFull {
	const move = movepiece.runActionAtGameFront(gamefile, () =>
		// Doesn't touch the mesh
		commitMove(gamefile, moveTagged),
	);
	// Appending the move may have reallocated the piece arrays; if so, rebuild the
	// mesh (now back on the viewed position) to match. REQUIRED.
	if (mesh && gamefile.pieces.newlyRegenerated)
		piecemodels.regenAll(gamecore.getGameContext(), gamefile, mesh);
	return move;
}

/** Convenience wrapper: Makes a global forward move then animates it if the mesh exists. */
function makeMoveAndAnimate(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	moveTagged: MoveTagged,
	options: { doGameOverChecks?: boolean } = {},
): MoveFull {
	const move = makeMove(gamefile, mesh, moveTagged, options);
	if (mesh) animateMove(move.changes, true);
	return move;
}

/**
 * Wrapper for performing the graphical mesh changes of an edit.
 *
 * If the newlyRegenerated flag is present, indicating the organized pieces were regenerated,
 * than we instead need to regenerate all piece models.
 * Otherwise, we run graphical changes as normal.
 *
 * We have to regenerate ALL types here, not just the ones whos type ranges
 * were affected, because other pieces may still need graphical changes
 * from the move's changes! For example, pawn deleted that promoted.
 */
function runMeshChanges(boardsim: GameFile, mesh: Mesh, edit: Edit, forward: boolean): void {
	if (boardsim.pieces.newlyRegenerated)
		piecemodels.regenAll(gamecore.getGameContext(), boardsim, mesh);
	else boardchanges.runChanges(mesh, edit.changes, meshChanges, forward); // Graphical changes
	frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
}

/** Makes a global backward move in the game. */
function rewindMove(gamefile: GameFile, mesh: Mesh | undefined): void {
	// Terminate all current animations to avoid a crash when undoing moves
	animation.clearAnimations();
	// movepiece.rewindMove() deletes the move, so we need to keep a reference here.
	const lastMove = moveutil.getLastMove(gamefile.moves)!;
	movepiece.rewindMove(gamefile); // Logical changes
	if (mesh) boardchanges.runChanges(mesh, lastMove.changes, meshChanges, false); // Graphical changes
	frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
	gamefile.gameConclusion = undefined; // Un-conclude the game if it was concluded
	GameBus.dispatch('moves-changed'); // Backward chokepoint for the committed move list (mirrors makeMove).
	GameBus.dispatch('view-move'); // Deleting the front move also moves the viewed position back to it.
	GameBus.dispatch('view-front'); // ...which is the new front, so the moves panel follows it.

	premoves.cancelPremoves(gamefile, mesh); // Any move change invalidates all premoves.
}

// Local Moving ----------------------------------------------------------------------------------------------------------

/**
 * Applies a move's logical + mesh changes to *view* it (instead of making it),
 * forward or backward. Callers are responsible for dispatching the `view-move` event.
 */
function viewMove(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	move: MoveFull,
	forward = true,
): void {
	// In analysis mode, every ply is a real, editable position you can branch from,
	// so viewing a move must also advance whose turn it is. Elsewhere, whosTurn stays
	// pinned to the front for online/engine turn detection.
	const updateTurn = gamesession.getGameType() === 'analysis';
	movepiece.applyMove(gamefile, move, forward, updateTurn); // Apply the logical changes.

	if (mesh) {
		boardchanges.runChanges(mesh, move.changes, meshChanges, forward); // Apply the graphical changes.
		frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
	}
}

/**
 * Makes the game view a set move index
 * @param index the move index to goto
 * @param animateFinal - Whether to animate the LAST move applied to reach the index (the
 *   rest are applied instantly). The animation runs in whichever direction we're navigating.
 */
function viewIndex(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	index: number,
	animateFinal: boolean,
): void {
	const forward = index >= gamefile.state.local.moveIndex;
	let lastMove: MoveFull | undefined;
	movepiece.goToMove(gamefile, index, (move: MoveFull) => {
		viewMove(gamefile, mesh, move, forward);
		lastMove = move;
	});

	if (lastMove) {
		// Dispatch ONCE for the whole navigation, not per-ply. Listeners only care about the final resting position.
		GameBus.dispatch('view-move');
		// Only clear any previous animations if we viewed a different index.
		animation.clearAnimations();
		if (animateFinal && mesh) animateMove(lastMove.changes, forward);
	}
}

/** Makes the game view the start of the game, before the first move. */
function viewStart(gamefile: GameFile, mesh: Mesh | undefined): void {
	/** Call {@link viewIndex} with the index before the first move */
	viewIndex(gamefile, mesh, -1, false);
}

/** Makes the game view the last move. */
function viewFront(gamefile: GameFile, mesh: Mesh | undefined, animateLast: boolean): void {
	/** Call {@link viewIndex} with the index of the last move in the game */
	viewIndex(gamefile, mesh, gamefile.moves.length - 1, animateLast);
	// Announce the jump-to-front so the moves panel scrolls to follow it.
	GameBus.dispatch('view-front');
}

/**
 * Called when we hit the left/right arrows keys,
 * or click the rewind/forward move buttons.
 *
 * This VIEWS the next move, whether forward or backward,
 * makes the graphical (mesh) changes, animates it, and updates the GUI.
 *
 * ASSUMES that it is legal to navigate in the direction.
 */
function navigateMove(gamefile: GameFile, mesh: Mesh | undefined, forward: boolean): void {
	// Determine the index of the move to apply
	const idx = forward ? gamefile.state.local.moveIndex + 1 : gamefile.state.local.moveIndex;

	// Make sure the move exists. Normally we'd never call this method
	// if it does, but just in case we forget to check.
	const move = gamefile.moves[idx];
	if (move === undefined)
		throw Error(`Move is undefined. Should not be navigating move. forward: ${forward}`);

	viewMove(gamefile, mesh, move, forward); // Apply the logical + graphical changes
	GameBus.dispatch('view-move');
	animateMove(move.changes, forward); // Animate
}

// --------------------------------------------------------------------------------------------------------------------------

export default {
	makeMove,
	makeMoveKeepingView,
	makeMoveAndAnimate,
	runMeshChanges,
	rewindMove,
	viewIndex,
	viewStart,
	viewFront,
	navigateMove,
};
