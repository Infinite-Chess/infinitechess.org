
/**
 * This script contains the functions that know what mesh changes to make,
 * and what animations to make, according to each action of a move's actions list.
 */


import type { ChangeApplication, Change, genericChangeFunc } from "../../chess/logic/boardchanges.js";
import type { Mesh } from "../rendering/piecemodels.js";

// @ts-ignore
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
		"capture":	captureMeshPiece,
	},
	backward: {
		"delete": addMeshPiece,
		"add": deleteMeshPiece,
		"move": returnMeshPiece,
		"capture": uncaptureMeshPiece,
	}
};

/**
 * A generic function that animates a move change.
 * 
 * DOES NOT ALTER the mesh or piece lists.
 * @param change - The change to animate.
 * @param instant - Whether to animate instantly. Only the SOUND will be played.
 * @param clearanimations - Whether to delete all previous animations before starting this one.
 */
// eslint-disable-next-line no-unused-vars
type animationFunc = (change: Change, instant: boolean, clearanimations: boolean) => void

/**
 * An object mapping move changes to a function that starts the animation for that action.
 */
const animatableChanges: ChangeApplication<animationFunc> = {
	forward: {
		"move": animateMove,
		"capture": animateCapture,
	},
	backward: {
		"move": animateReturn,
		"capture": animateReturn,
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
	if (change.action !== 'move' && change.action !== 'capture') throw Error(`moveMeshPiece called with non-move action: ${change.action}`);
	piecemodels.overwritebufferdata(mesh, { type: change.piece.type, coords: change.endCoords, index: change.piece.index });
}

function returnMeshPiece(mesh: Mesh, change: Change) {
	piecemodels.overwritebufferdata(mesh, change.piece);
}

function captureMeshPiece(mesh: Mesh, change: Change) {
	if (change.action !== 'capture') throw Error(`captureMeshPiece called with non-capture action: ${change.action}`);

	piecemodels.deletebufferdata(mesh, change.capturedPiece);
	moveMeshPiece(mesh, change);
}

function uncaptureMeshPiece(mesh: Mesh, change: Change) {
	if (change.action !== 'capture') throw Error(`uncaptureMeshPiece called with non-capture action: ${change.action}`);

	returnMeshPiece(mesh, change);
	addMeshPiece(mesh, { action: 'add', main: change.main, piece: change.capturedPiece });
}


// Animate -----------------------------------------------------------------------------------------


function animateMove(change: Change, instant: boolean, clearanimations: boolean) {
	if (change.action !== 'move') throw Error(`animateMove called with non-move action: ${change.action}`);
	const waypoints = change.path ?? [change.piece.coords, change.endCoords];
	if (instant === false && preferences.getAnimationsMode() === false) instant = true; // If animations are disabled, make it instant (sound only), just like dropping dragged pieces.
	animation.animatePiece(change.piece.type, waypoints, undefined, instant, clearanimations);
}

function animateReturn(change: Change, instant: boolean, clearanimations: boolean) {
	if (change.action !== 'move' && change.action !== 'capture') throw Error(`animateReturn called with non-move action: ${change.action}`);
	const waypoints = change.path?.slice().reverse() ?? [change['endCoords'], change.piece.coords]; // slice() required because reverse() is mutating
	if (instant === false && preferences.getAnimationsMode() === false) instant = true; // If animations are disabled, make it instant (sound only), just like dropping dragged pieces.
	animation.animatePiece(change.piece.type, waypoints, undefined, instant, clearanimations);
}

function animateCapture(change: Change, instant: boolean, clearanimations: boolean) {
	if (change.action !== 'capture') throw Error(`animateCapture called with non-capture action: ${change.action}`);
	const waypoints = change.path ?? [change.piece.coords, change.endCoords];
	if (instant === false && preferences.getAnimationsMode() === false) instant = true; // If animations are disabled, make it instant (sound only), just like dropping dragged pieces.
	animation.animatePiece(change.piece.type, waypoints, change.capturedPiece, instant, clearanimations);
}


export {
	animatableChanges,
	meshChanges,
};