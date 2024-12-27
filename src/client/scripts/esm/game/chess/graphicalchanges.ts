// @ts-ignore
import animation from "../rendering/animation.js";
// @ts-ignore
import piecesmodel from "../rendering/piecesmodel.js";
// @ts-ignore
import organizedlines from "../../chess/logic/organizedlines.js";

// @ts-ignore
import type { ChangeApplication, Change, genericChangeFunc } from "../../chess/logic/boardchanges.js";
// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";


// The functions for animating changes, does not use/alter gamefile directly
// eslint-disable-next-line no-unused-vars
type animationFunc = (change: Change, clearanimations: boolean) => void

const animatableChanges: ChangeApplication<animationFunc> = {
	forward: {
		"movePiece": animateMove,
		"capturePiece": animateCapture,
	},

	backward: {
		"movePiece": animateReturn,
		"capturePiece": animateReturn,
	}
};

function animateMove(change: Change, clearanimations: boolean) {
	animation.animatePiece(change['piece'].type, change['piece'].coords, change['endCoords'], undefined, clearanimations);
}

function animateReturn(change: Change, clearanimations: boolean) {
	animation.animatePiece(change['piece'].type, change['endCoords'], change['piece'].coords, undefined, clearanimations);
}

function animateCapture(change: Change, clearanimations: boolean) {
	animation.animatePiece(change['piece'].type, change['piece'].coords, change['endCoords'], change['capturedPiece'], clearanimations);
}

const meshChanges: ChangeApplication<genericChangeFunc> = {
	forward: {
		"add": addMeshPiece,
		"delete": deleteMeshPiece,
		"movePiece": moveMeshPiece,
		"capturePiece":	captureMeshPiece,
	},

	backward: {
		"delete": addMeshPiece,
		"add": deleteMeshPiece,
		"movePiece": returnMeshPiece,
		"capturePiece": uncaptureMeshPiece,
	}
};

function addMeshPiece(gamefile: gamefile, change: Change) {
	piecesmodel.overwritebufferdata(gamefile, change['piece'], change['piece'].coords, change['piece'].type);

	// Do we need to add more undefineds?
	// Only adding pieces can ever reduce the number of undefineds we have, so we do that here!
	if (organizedlines.areWeShortOnUndefineds(gamefile)) organizedlines.addMoreUndefineds(gamefile, { log: true });
}

function deleteMeshPiece(gamefile: gamefile, change: Change) {
	piecesmodel.deletebufferdata(gamefile, change['piece']);
}

function moveMeshPiece(gamefile: gamefile, change: Change) {
	piecesmodel.movebufferdata(gamefile, change['piece'], change['endCoords']);
}

function returnMeshPiece(gamefile: gamefile, change: Change) {
	piecesmodel.movebufferdata(gamefile, change['piece'], change['piece'].coords);
}

function captureMeshPiece(gamefile: gamefile, change: Change) {
	piecesmodel.deletebufferdata(gamefile, change['capturedPiece']);
	moveMeshPiece(gamefile, change);
}

function uncaptureMeshPiece(gamefile: gamefile, change: Change) {
	returnMeshPiece(gamefile, change);
	addMeshPiece(gamefile, {action: "add", piece: change['capturedPiece']});
}

export {
	animatableChanges,
	meshChanges,
};