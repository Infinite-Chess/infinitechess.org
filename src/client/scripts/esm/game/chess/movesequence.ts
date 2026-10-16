// src/client/scripts/esm/game/chess/movesequence.ts

/**
 * This is a client-side script that executes global and local moves,
 * making both the logical, and graphical changes.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { GameConclusion } from '../../../../../shared/chess/util/typeschemas.js';
import type { MoveFull, MoveTagged } from '../../../../../shared/chess/logic/movepiece.js';

import moveutil from '../../../../../shared/chess/logic/moveutil.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';
import wincondition from '../../../../../shared/chess/logic/wincondition.js';
import gamefileutility from '../../../../../shared/chess/logic/gamefileutility.js';

import gameslot from './gameslot.js';
import premoves from './premoves.js';
import gamescene from '../rendering/gamescene.js';
import animation from '../../board/rendering/animation/animation.js';
import { GameBus } from '../../board/GameBus.js';
import gamesession from './gamesession.js';
import frametracker from '../../board/rendering/frametracker.js';
import graphicalchanges from '../../board/rendering/graphicalchanges.js';
import piecemodels, { Mesh } from '../../board/rendering/piecemodels.js';

// Global Moving ---------------------------------------------------------------

/**
 * Commits a global forward move to the game's logic and conclusion. Must run at the front.
 * @param conclusion - 'detect' to detect it on our board, or the conclusion the move reached if known.
 */
function commitMove(
	gamefile: GameFile,
	moveTagged: MoveTagged,
	conclusion: 'detect' | GameConclusion | undefined,
): MoveFull {
	const move = movepiece.generateMove(gamefile, moveTagged);

	movepiece.makeMove(gamefile, move); // Logical changes

	// Must run before announceMove(): a checkmate conclusion flags the move as mate, and the
	// move list renders each ply's notation (# vs +) once, from the flags it sees then.
	if (conclusion === 'detect') wincondition.doGameOverChecks(gamefile);
	else wincondition.setGameConclusion(gamefile, conclusion);

	return move;
}

/** Announces a committed move, concluding the game if it ended it. Must run on the viewed position. */
function announceMove(gamefile: GameFile): void {
	// Forward chokepoint for the committed move list.
	GameBus.dispatch('moves-changed');

	// Must stay BELOW 'moves-changed': the reconcile it triggers has to enqueue before
	// 'game-concluded's scroll-to-bottom, so the final ply exists when we scroll.
	if (
		gamefileutility.isGameOver(gamefile) &&
		// Online games conclude where the server's message is applied, alongside its clocks.
		gamesession.getGameType() !== 'online' &&
		gamesession.getGameType() !== 'analysis'
	) {
		gameslot.concludeGame();
	}

	GameBus.dispatch('physical-move');
}

/** Makes a global forward move in the game and syncs the mesh to it. Does not animate. */
function makeMove(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	moveTagged: MoveTagged,
	conclusion: 'detect' | GameConclusion | undefined,
): MoveFull {
	const move = commitMove(gamefile, moveTagged, conclusion);
	announceMove(gamefile);
	if (mesh)
		graphicalchanges.runMeshChanges(gamescene.getGameContext(), gamefile, mesh, move, true);
	GameBus.dispatch('view-move'); // Committing a move at the front also advances the viewed position.
	GameBus.dispatch('view-front'); // ...to the new front, so the moves panel follows it.
	return move;
}

/**
 * Makes a global forward move WITHOUT changing which move we're viewing. Viewing the front, we
 * follow it there, animated. Otherwise, the logical board is temporarily fast-forwarded to the front
 * to append the move, then rewound before the move is announced. Silent, as only animations play sound.
 */
function makeMoveKeepingView(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	moveTagged: MoveTagged,
	conclusion: 'detect' | GameConclusion | undefined,
): MoveFull {
	if (moveutil.areWeViewingLatestMove(gamefile))
		return makeMoveAndAnimate(gamefile, mesh, moveTagged, conclusion);

	const move = movepiece.runActionAtGameFront(gamefile, () =>
		// Doesn't touch the mesh
		commitMove(gamefile, moveTagged, conclusion),
	);
	// Appending the move may have reallocated the piece arrays; if so, rebuild the
	// mesh (now back on the viewed position) to match. REQUIRED.
	if (mesh && gamefile.pieces.newlyRegenerated)
		piecemodels.regenAll(gamescene.getGameContext(), gamefile, mesh);
	announceMove(gamefile);
	return move;
}

/** Convenience wrapper: Makes a global forward move then animates it if the mesh exists. */
function makeMoveAndAnimate(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	moveTagged: MoveTagged,
	conclusion: 'detect' | GameConclusion | undefined,
): MoveFull {
	const move = makeMove(gamefile, mesh, moveTagged, conclusion);
	if (mesh) graphicalchanges.animateMove(gamescene.getGameContext(), move.changes, true);
	return move;
}

/** Makes a global backward move in the game. */
function rewindMove(gamefile: GameFile, mesh: Mesh | undefined): void {
	// Terminate all current animations to avoid a crash when undoing moves
	animation.clearAnimations(gamescene.getGameContext());
	// movepiece.rewindMove() deletes the move, so we need to keep a reference here.
	const lastMove = moveutil.getLastMove(gamefile.moves)!;
	movepiece.rewindMove(gamefile); // Logical changes
	if (mesh) boardchanges.runChanges(mesh, lastMove.changes, graphicalchanges.CHANGE_FUNCS, false); // Graphical changes
	frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
	gamefile.gameConclusion = undefined; // Un-conclude the game if it was concluded
	GameBus.dispatch('moves-changed'); // Backward chokepoint for the committed move list (mirrors makeMove).
	GameBus.dispatch('view-move'); // Deleting the front move also moves the viewed position back to it.
	GameBus.dispatch('view-front'); // ...which is the new front, so the moves panel follows it.

	premoves.cancelPremoves(gamefile, mesh); // Any move change invalidates all premoves.
}

// Local Moving ----------------------------------------------------------------

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
		boardchanges.runChanges(mesh, move.changes, graphicalchanges.CHANGE_FUNCS, forward); // Apply the graphical changes.
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
		const board = gamescene.getGameContext();
		animation.clearAnimations(board);
		if (animateFinal && mesh) graphicalchanges.animateMove(board, lastMove.changes, forward);
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
	graphicalchanges.animateMove(gamescene.getGameContext(), move.changes, forward); // Animate
}

// Exports ---------------------------------------------------------------------

export default {
	// Global Moving
	makeMove,
	makeMoveKeepingView,
	makeMoveAndAnimate,
	rewindMove,
	// Local Moving
	viewIndex,
	viewStart,
	viewFront,
	navigateMove,
};
