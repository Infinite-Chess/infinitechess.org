// @ts-ignore
import animation from "../rendering/animation.js";
// @ts-ignore
import piecesmodel from "../rendering/piecesmodel.js";
// @ts-ignore
import organizedlines from "../../chess/logic/organizedlines.js";

// @ts-ignore
import type { ChangeApplication, PieceChange, MoveChange, CaptureChange, ActionList } from "../../chess/logic/boardchanges.js";
// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";

// ESLint, THIS IS A TYPE INTERFACE SHUT UP
interface ChangeAnimations {
	// eslint-disable-next-line no-unused-vars
	forward: ActionList<(change: CaptureChange, clearanimations: boolean) => void>
	// eslint-disable-next-line no-unused-vars
	backward: ActionList<(change: MoveChange, clearanimations: boolean) => void>
}

const animatableChanges: ChangeAnimations = {
	forward: {
		"movePiece": animateMove,
		"capturePiece": animateCapture,
	},

	backward: {
		"movePiece": animateReturn,
		"capturePiece": animateReturn,
	}
};

function animateMove(change: MoveChange, clearanimations: boolean) {
	animation.animatePiece(change.piece.type, change.piece.coords, change.endCoords, undefined, clearanimations);
}

function animateReturn(change: MoveChange, clearanimations: boolean) {
	animation.animatePiece(change.piece.type, change.endCoords, change.piece.coords, undefined, clearanimations);
}

function animateCapture(change: CaptureChange, clearanimations: boolean) {
	animation.animatePiece(change.piece.type, change.piece.coords, change.endCoords, change.capturedPiece.type, clearanimations);
}

const meshChanges: ChangeApplication = {
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

function addMeshPiece(gamefile: gamefile, change: PieceChange) {
	piecesmodel.overwritebufferdata(gamefile, change.piece, change.piece.coords, change.piece.type);

	// Do we need to add more undefineds?
	// Only adding pieces can ever reduce the number of undefineds we have, so we do that here!
	if (organizedlines.areWeShortOnUndefineds(gamefile)) organizedlines.addMoreUndefineds(gamefile, { log: true });
}

function deleteMeshPiece(gamefile: gamefile, change: PieceChange) {
	piecesmodel.deletebufferdata(gamefile, change.piece);
}

function moveMeshPiece(gamefile: gamefile, change: MoveChange) {
	piecesmodel.movebufferdata(gamefile, change.piece, change.endCoords);
}

function returnMeshPiece(gamefile: gamefile, change: MoveChange) {
	piecesmodel.movebufferdata(gamefile, change.piece, change.piece.coords);
}

function captureMeshPiece(gamefile: gamefile, change: CaptureChange) {
	piecesmodel.deletebufferdata(gamefile, change.capturedPiece);
	moveMeshPiece(gamefile, change);
}

function uncaptureMeshPiece(gamefile: gamefile, change: CaptureChange) {
	returnMeshPiece(gamefile, change);
	addMeshPiece(gamefile, {action: "addPiece", piece: change.capturedPiece});
}

export {
	animatableChanges,
	meshChanges,
};