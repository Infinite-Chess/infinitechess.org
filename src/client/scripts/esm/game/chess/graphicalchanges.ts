
import animation from "../rendering/animation";
import piecesmodel from "../rendering/piecesmodel";
import organizedlines from "../../chess/logic/organizedlines";
import coordutil from "../../chess/util/coordutil";

// @ts-ignore
import type { ChangeApplication, PieceChange, MoveChange, CaptureChange } from "../../chess/logic/boardchanges";
// @ts-ignore
import type gamefile from "../../chess/logic/gamefile";

const animatableChanges: ChangeApplication = {
	forward: {
		"movePiece": animateMove,
		"capturedPiece": animateCapture,
	},

	backward: {
		"movePiece": animateReturn,
		"capturePiece": animateReturn,
	}
};

function animateMove(gamefile: gamefile, change: MoveChange) {
	animation.animatePiece(change.piece.type, change.piece.coords, change.endCoords);
}

function animateReturn(gamefile: gamefile, change: MoveChange) {
	animation.animatePiece(change.piece.type, change.endCoords, change.piece.coords);
}

function animateCapture(gamefile: gamefile, change: CaptureChange) {
	animation.animatePiece(change.piece.type, change.piece.coords, change.endCoords, coordutil.getKeyFromCoords(change.capturedPiece.coords));
}

const meshChanges: ChangeApplication = {
	forward: {
		"add": addMeshPiece,
		"delete": deleteMeshPiece,
		"movePiece": moveMeshPiece,
		"capturePiece": moveMeshPiece,
	},

	backward: {
		"delete": addMeshPiece,
		"add": deleteMeshPiece,
		"movePiece": returnMeshPiece,
		"capturePiece": returnMeshPiece,
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

export {
	animatableChanges,
	meshChanges,
}