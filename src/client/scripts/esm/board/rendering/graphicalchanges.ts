// src/client/scripts/esm/board/rendering/graphicalchanges.ts

/**
 * This script contains the functions that know what mesh changes to make,
 * and what animations to make, according to each action of a move's actions list.
 */

import type { Mesh } from './piecemodels.js';
import type { Edit } from '../../../../../shared/chess/logic/movepiece.js';
import type LiveBoard from './LiveBoard.js';
import type { Piece } from '../../../../../shared/chess/logic/boardutil.js';
import type { Coords } from '../../../../../shared/util/coordutil.js';
import type RenderContext from './RenderContext.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';
import type {
	ChangeApplication,
	Change,
	genericChangeFunc,
} from '../../../../../shared/chess/logic/boardchanges.js';

import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';

import animation from './animation/animation.js';
import piecemodels from './piecemodels.js';
import preferences from '../../util/preferences.js';

// Constants -------------------------------------------------------------------

/** Maps each move change to the function that performs its mesh changes. */
const CHANGE_FUNCS: ChangeApplication<genericChangeFunc<Mesh>> = {
	forward: {
		add: addMeshPiece,
		delete: deleteMeshPiece,
		move: moveMeshPiece,
		capture: deleteMeshPiece,
	},
	backward: {
		delete: addMeshPiece,
		add: deleteMeshPiece,
		move: returnMeshPiece,
		capture: addMeshPiece,
	},
};

// Executing changes of a Move -------------------------------------------------

/**
 * Applies an edit's changes to a board's mesh, then flags the board for a redraw.
 * Regenerates every piece type's model instead when the edit regenerated the organized pieces,
 * as other pieces may still need the edit's changes (e.g. the pawn deleted by a promotion).
 */
function runMeshChanges(
	ctx: RenderContext,
	boardsim: BoardPreview,
	mesh: Mesh,
	edit: Edit,
	forward: boolean,
): void {
	if (boardsim.pieces.newlyRegenerated) piecemodels.regenAll(ctx, boardsim, mesh);
	else boardchanges.runChanges(mesh, edit.changes, CHANGE_FUNCS, forward);
	ctx.frames.onVisualChange();
}

// Standard Change Functions ---------------------------------------------------

/** Writes a piece into the mesh at its coords. */
function addMeshPiece(mesh: Mesh, change: Change): void {
	piecemodels.overwritebufferdata(mesh, change.piece);
}

/** Erases a piece from the mesh. */
function deleteMeshPiece(mesh: Mesh, change: Change): void {
	piecemodels.deletebufferdata(mesh, change.piece);
}

/** Rewrites a moved piece into the mesh at its destination. */
function moveMeshPiece(mesh: Mesh, change: Change): void {
	if (change.action !== 'move')
		throw Error(`moveMeshPiece called with non-move action: ${change.action}`);
	piecemodels.overwritebufferdata(mesh, {
		type: change.piece.type,
		coords: change.endCoords,
		index: change.piece.index,
	});
}

/** Rewrites a moved piece into the mesh back at its origin, undoing {@link moveMeshPiece}. */
function returnMeshPiece(mesh: Mesh, change: Change): void {
	piecemodels.overwritebufferdata(mesh, change.piece);
}

// Animate ---------------------------------------------------------------------

/**
 * Animates a given set of changes on a board.
 * We don't use boardchanges because a custom compositor is needed.
 * @param moveChanges - the changes to animate
 * @param forward - whether this is a forward or back animation
 * @param animateMain - Whether the main piece targeted by the move should be animated.
 * 		All secondary pieces are guaranteed animated. If this is false, the main piece
 * 		animation will be instantaneous, only playing the SOUND.
 * @param premove - Whether this animation is for a premove.
 * @param force_instant - Whether to FORCE instant animation, EVEN secondary pieces won't be
 * 		animated. Enable when you are playing a premove in the game.
 */
function animateMove(
	board: LiveBoard,
	moveChanges: Change[],
	forward = true,
	animateMain = true,
	premove = false,
	force_instant = false,
): void {
	let clearanimations = true; // The first animation of a turn should clear prev turns animation

	// Helper function for pushing an item to an array in a map, creating the array if it does not exist.
	function pushToArrayMap<K, V>(map: Map<K, V[]>, key: K, apple: V): void {
		let t = map.get(key);
		if (!t) {
			t = [];
			map.set(key, t);
		}
		t.push(apple);
	}

	let showKeyframes: Map<number, Piece[]> = new Map();
	let hideKeyframes: Map<number, Piece[]> = new Map();
	for (const change of moveChanges) {
		if (change.action === 'capture') {
			// Queue all captures to be associated with the next move
			pushToArrayMap(showKeyframes, change.order, change.piece);
		} else if (change.action === 'move') {
			const instant =
				(change.main && !animateMain) || !preferences.getAnimationsMode() || force_instant; // Whether the animation should be instantaneous, only playing the SOUND.
			let waypoints = change.path ?? [change.piece.coords, change.endCoords];

			// Put all pieces captured last in the last keyframe
			const last = waypoints.length - 1;
			const lastDef = showKeyframes.get(last);
			const assumeLast = showKeyframes.get(-1);
			showKeyframes.delete(-1);
			if ((lastDef === undefined) !== (assumeLast === undefined)) {
				showKeyframes.set(last, (lastDef ?? assumeLast)!); // Only one is defined
			} else if (lastDef !== undefined) {
				showKeyframes.set(last, [...lastDef, ...assumeLast!]);
			} // Don't need to do anything

			// Flip those being hidden and those being shown if it is a reverse move
			if (!forward) {
				waypoints = waypoints.slice().reverse();
				// Helper that inverts orders at the start of the path to the end, and vice versa.
				// x remains the same, but y is set to the inverted x.
				function invert<V>(x: Map<number, V>, y: Map<number, V>): void {
					y.clear();
					x.forEach((v, k) => {
						y.set(last - k, v);
					});
				}
				const t = new Map<number, Piece[]>();
				invert(showKeyframes, t);
				invert(hideKeyframes, showKeyframes);
				hideKeyframes = t;
			}

			// Prune those that will never be seen
			hideKeyframes.delete(0);
			showKeyframes.delete(0);

			// Convert hideKeyframes to a Coords[] array, as the animation function expects this.
			const newHideFrames: Map<number, Coords[]> = new Map();
			for (const [k, v] of hideKeyframes)
				newHideFrames.set(
					k,
					v.map((p) => p.coords),
				); // Mutate to remove unnecessary info

			// Hide where the moved piece is actually
			pushToArrayMap(newHideFrames, last, waypoints[last]);

			animation.animatePiece(
				board,
				change.piece.type,
				waypoints,
				showKeyframes,
				newHideFrames,
				instant,
				clearanimations,
				premove,
			);

			showKeyframes = new Map();
			hideKeyframes.clear();
			clearanimations = false;
		}
	}
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	CHANGE_FUNCS,
	// Executing changes of a Move
	runMeshChanges,
	// Animate
	animateMove,
};
