import wincondition from "../chess/wincondition.js";
import movesscript from "../chess/movesscript.js";
import math from "../misc/math.js";
import gamefileutility from "../chess/gamefileutility.js";
import movepiece from "../chess/movepiece.js";
import typeutil from "../misc/typeutil.js";

/**
 * @typedef {Object} atomicMix
 * @property {?Piece[]} nukedPieces
 */

/**
 * I hate vscode 
 * @typedef {Move  & atomicMix} atomicMove
 */
function init() {
	addEventListener('move', onMove);
	addEventListener('rewindMove', onRewind);
	addEventListener('checkConclusion', checkConclusion);
}

function reset() {
	removeEventListener('move', onMove);
	removeEventListener('rewindMove', onRewind);
	removeEventListener('checkConclusion', checkConclusion);
}

/**
 * 
 * @param {CustomEvent} event
 */
function checkConclusion(event) {
	// TBH JUST USE ALL ROYALS CAP
	// NO MESSAGE SUPPORTED YET
	/** @type {gamefile} */
	const gamefile = event.detail.gamefile;

	if (!wincondition.isOpponentUsingWinCondition(gamefile, 'atomicroyalcapture')) return;

	if (event.defaultPrevented) return;

	/** @type {atomicMove} */
	const lastMove = movesscript.getLastMove(gamefile.moves);

	if (!lastMove.nukedPieces) return;

	let royalNuke = false;

	for (const piece of lastMove.nukedPieces) {
		const type = math.trimWorBFromType(piece.type);
		if (typeutil.royals.includes(type)) {
			royalNuke = true;
			break;
		}
	}
	if (!royalNuke) return;
	event.preventDefault();
	event.detail.conclusion.push(`${math.getOppositeColor(gamefile.whosTurn)} atomicroyalcapture`);
	return;
}

/**
 * 
 * @param {CustomEvent} event
 */
function onRewind(event) {
	const gamefile = event.detail.gamefile;
	const move = event.detail.move;
	if (!move.nukedPieces) return;

	for (const piece of move.nukedPieces) {
		movepiece.addPiece(gamefile, piece.type, piece.coords, piece.index, { updateData:event.detail.options.updateData });
	}
}

/**
 * 
 * @param {CustomEvent} event
 */
function onMove(event) {
	const gamefile = event.detail.gamefile;
	const move = event.detail.move;
	if (move.captured === undefined) return;

	const width = 1;
	const height = 1;

	move.nukedPieces = [];

	for (let dx = -width; dx <= width; dx++) { for (let dy = -height; dy <= height; dy++) {
		const ecoord = [move.endCoords[0] + dx, move.endCoords[1] + dy];
		const nukePiece = gamefileutility.getPieceAtCoords(gamefile, ecoord);

		if (!nukePiece) continue;
		movepiece.deletePiece(gamefile, nukePiece, { updateData:event.detail.options.updateData });
		move.nukedPieces.push(nukePiece);
	}};
}
export default {
	init,
	reset,
};