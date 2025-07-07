
/**
 * This script contains the functions that know what mesh changes to make,
 * and what animations to make, according to each action of a move's actions list.
 */


import type { ChangeApplication, Change, genericChangeFunc } from "../../chess/logic/boardchanges.js";
import type { Mesh } from "../rendering/piecemodels.js";
import type { Move } from "../../chess/logic/movepiece.js";
import type { Piece } from "../../chess/util/boardutil.js";

import animation from "../rendering/animation.js";
import piecemodels from "../rendering/piecemodels.js";
import preferences from "../../components/header/preferences.js";


// Type Definitions -----------------------------------------------------------------------------------------

/**
 * An object mapping move changes to a function that performs the graphical mesh change for that action.
 */
const meshChanges: ChangeApplication<genericChangeFunc<Mesh>> = {
	forward: {
		"add": addMeshPiece,
		"delete": deleteMeshPiece,
		"move": moveMeshPiece,
		"capture": deleteMeshPiece,
	},
	backward: {
		"delete": addMeshPiece,
		"add": deleteMeshPiece,
		"move": returnMeshPiece,
		"capture": addMeshPiece,
	}
};

// Mesh Changes -----------------------------------------------------------------------------------------


function addMeshPiece(mesh: Mesh, change: Change) {
	piecemodels.overwritebufferdata(mesh, change.piece);
}

function deleteMeshPiece(mesh: Mesh, change: Change) {
	piecemodels.deletebufferdata(mesh, change.piece);
}

function moveMeshPiece(mesh: Mesh, change: Change) {
	if (change.action !== 'move') throw Error(`moveMeshPiece called with non-move action: ${change.action}`);
	piecemodels.overwritebufferdata(mesh, { type: change.piece.type, coords: change.endCoords, index: change.piece.index });
}

function returnMeshPiece(mesh: Mesh, change: Change) {
	piecemodels.overwritebufferdata(mesh, change.piece);
}

// Animate -----------------------------------------------------------------------------------------

/**
 * Animates a given move.
 * We don't use boardchanges because custom functionality is needed.
 * @param move the move to animate
 * @param forward whether this is a forward or back animation
 * @param animateMain Whether the main piece targeted by the move should be animated. All secondary pieces are guaranteed animated. If this is false, the main piece animation will be instantanious, only playing the SOUND.
 */
function animateMove(move: Move, forward = true, animateMain = true) {
	let clearanimations = true; // The first animation of a turn should clear prev turns animation

	// TODO: figure out a way to animate multiple moves of the same piece
	// Keyframing or smth

	// How does the rose animate?

	function pushToArrayMap<K, V>(map: Map<K, V[]>, key: K, apple: V) {
		let t = map.get(key);
		if (!t) {
			t = [];
			map.set(key, t);
		}
		t.push(apple);
	}

	let showKeyframes: Map<number, Piece[]> = new Map();
	let hideKeyframes: Map<number, Piece[]> = new Map();
	for (const change of move.changes) {
		if (change.action === "capture") {
			pushToArrayMap(showKeyframes, change.order, change.piece);
		} else if (change.action === "move") {
			const instant = (change.main && !animateMain) || !preferences.getAnimationsMode(); // Whether the animation should be instantanious, only playing the SOUND.
			let waypoints = change.path ?? [change.piece.coords, change.endCoords];

			const last = waypoints.length - 1;
			const lastDef = showKeyframes.get(last);
			const assumeLast = showKeyframes.get(-1);
			showKeyframes.delete(-1);
			if ((lastDef === undefined) !== (assumeLast === undefined)) {
				showKeyframes.set(last, (lastDef ?? assumeLast)!); // Only one is defined
			} else if (lastDef !== undefined) {
				showKeyframes.set(last, [...lastDef, ...assumeLast!]);
			} // Don't need to do anything 

			// Flip if reversing move
			waypoints = forward ? waypoints : waypoints.slice().reverse();
			if (!forward) {
				const invert = function<V>(x: Map<number,V>, y: Map<number,V>) {
					y.clear();
					x.forEach((v, k) => {
						y.set(last - k,v);
					});
				};
				const t = new Map();
				invert(showKeyframes, t);
				invert(hideKeyframes, showKeyframes);
				hideKeyframes = t;
			}

			pushToArrayMap(hideKeyframes, last, {coords: waypoints[last], type: -1, index: -1});

			// Prune those that will never be seen
			hideKeyframes.delete(0);
			showKeyframes.delete(0);

			const newHideFrames = new Map();
			for (const [k, v] of hideKeyframes) newHideFrames.set(k, v.map(p => p.coords)); // Mutate to remove unnessacary info

			console.log(showKeyframes, newHideFrames);

			animation.animatePiece(change.piece.type, waypoints, showKeyframes, newHideFrames, instant, clearanimations);
			
			showKeyframes = new Map();
			hideKeyframes.clear();
			clearanimations = false;
		}

	}
}

export {
	animateMove,
	meshChanges,
};