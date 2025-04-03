
/**
 * This script contains the functions that know what mesh changes to make,
 * and what animations to make, according to each action of a move's actions list.
 */


import type { ChangeApplication, Change, genericChangeFunc } from "../../chess/logic/boardchanges.js";
// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";


import piecemodels from "../rendering/piecemodels.js";
// @ts-ignore
import animation from "../rendering/animation.js";
import preferences from "../../components/header/preferences.js";


// Type Definitions -----------------------------------------------------------------------------------------


/**
 * An object mapping move changes to a function that performs the graphical mesh change for that action.
 */
const meshChanges: ChangeApplication<genericChangeFunc> = {
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


function addMeshPiece(gamefile: gamefile, change: Change) {
	piecemodels.overwritebufferdata(gamefile, change.piece);
}

function deleteMeshPiece(gamefile: gamefile, change: Change) {
	piecemodels.deletebufferdata(gamefile, change.piece);
}

function moveMeshPiece(gamefile: gamefile, change: Change) {
	if (change.action !== 'move' && change.action !== 'capture') throw Error(`moveMeshPiece called with non-move action: ${change.action}`);
	piecemodels.overwritebufferdata(gamefile, { type: change.piece.type, coords: change.endCoords, index: change.piece.index });
}

function returnMeshPiece(gamefile: gamefile, change: Change) {
	piecemodels.overwritebufferdata(gamefile, change.piece);
}

function captureMeshPiece(gamefile: gamefile, change: Change) {
	if (change.action !== 'capture') throw Error(`captureMeshPiece called with non-capture action: ${change.action}`);

	piecemodels.deletebufferdata(gamefile, change.capturedPiece);
	moveMeshPiece(gamefile, change);
}

function uncaptureMeshPiece(gamefile: gamefile, change: Change) {
	if (change.action !== 'capture') throw Error(`uncaptureMeshPiece called with non-capture action: ${change.action}`);

	returnMeshPiece(gamefile, change);
	addMeshPiece(gamefile, { action: 'add', main: change.main, piece: change.capturedPiece });
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