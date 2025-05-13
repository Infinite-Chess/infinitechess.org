/**
 * This script handles sending our move in online games to the server,
 * and receiving moves from our opponent.
 */

import type { OpponentsMoveMessage } from "./onlinegamerouter.js";
// @ts-ignore
import type gamefile from "../../../chess/logic/gamefile.js";
import type { MoveDraft } from "../../../chess/logic/movepiece.js";
import type { Mesh } from "../../rendering/piecemodels.js";

import onlinegame from "./onlinegame.js";
import gamefileutility from "../../../chess/util/gamefileutility.js";
import boardutil from "../../../chess/util/boardutil.js";
import clock from "../../../chess/logic/clock.js";
import jsutil from "../../../util/jsutil.js";
import selection from "../../chess/selection.js";
import gameslot from "../../chess/gameslot.js";
import moveutil from "../../../chess/util/moveutil.js";
import movesequence from "../../chess/movesequence.js";
import icnconverter from "../../../chess/logic/icn/icnconverter.js";
// @ts-ignore
import legalmoves from "../../../chess/logic/legalmoves.js";
// @ts-ignore
import specialdetect from "../../../chess/logic/specialdetect.js";
// @ts-ignore
import guiclock from "../../gui/guiclock.js";
// @ts-ignore
import guipause from "../../gui/guipause.js";
// @ts-ignore
import websocket from "../../websocket.js";


// Functions -------------------------------------------------------------------


/**
 * Called when selection.js moves a piece. This will send it to the server
 * if we're in an online game.
 */
function sendMove() {
	if (!onlinegame.areInOnlineGame() || !onlinegame.areInSync() || !websocket.areSubbedToSub('game')) return; // Skip
	// console.log("Sending our move..");

	const gamefile = gameslot.getGamefile()!;
	const lastMove = moveutil.getLastMove(gamefile.moves)!;
	if (lastMove.isNull) throw Error('Cannot submit null move to online game.');
	const shortmove = lastMove.compact; // "x,y>x,yN"

	const data = {
		move: shortmove,
		moveNumber: gamefile.moves.length,
		gameConclusion: gamefile.gameConclusion,
	};

	websocket.sendmessage('game', 'submitmove', data, true);

	onlinegame.onMovePlayed({ isOpponents: false });
}

/**
 * Called when we received our opponents move. This verifies they're move
 * and claimed game conclusion is legal. If it isn't, it reports them and doesn't forward their move.
 * If it is legal, it forwards the game to the front, then forwards their move.
 */
function handleOpponentsMove(gamefile: gamefile, mesh: Mesh, message: OpponentsMoveMessage) {
	// Make sure the move number matches the expected.
	// Otherwise, we need to re-sync
	const expectedMoveNumber = gamefile.moves.length + 1;
	if (message.moveNumber !== expectedMoveNumber) {
		console.error(`We have desynced from the game. Resyncing... Expected opponent's move number: ${expectedMoveNumber}. Actual: ${message.moveNumber}. Opponent's move: ${JSON.stringify(message.move)}. Move number: ${message.moveNumber}`);
		return onlinegame.resyncToGame();
	}

	// Convert the move from compact short format "x,y>x,yN"
	let moveDraft: MoveDraft; // { startCoords, endCoords, promotion }
	try {
		moveDraft = icnconverter.parseCompactMove(message.move); // { startCoords, endCoords, promotion }
	} catch {
		console.error(`Opponent's move is illegal because it isn't in the correct format. Reporting... Move: ${JSON.stringify(message.move)}`);
		const reason = 'Incorrectly formatted.';
		return onlinegame.reportOpponentsMove(reason);
	}

	// If not legal, this will be a string for why it is illegal.
	const moveIsLegal = legalmoves.isOpponentsMoveLegal(gamefile, moveDraft, message.gameConclusion);
	if (moveIsLegal !== true) console.log(`Buddy made an illegal play: ${JSON.stringify(message.move)}. Move number: ${message.moveNumber}`);
	if (moveIsLegal !== true && !onlinegame.getIsPrivate()) return onlinegame.reportOpponentsMove(moveIsLegal); // Allow illegal moves in private games

	movesequence.viewFront(gamefile, mesh);

	// Forward the move...

	const piecemoved = boardutil.getPieceFromCoords(gamefile.pieces, moveDraft.startCoords)!;
	const legalMoves = legalmoves.calculate(gamefile, piecemoved);
	const endCoordsToAppendSpecial = jsutil.deepCopyObject(moveDraft.endCoords);
	legalmoves.checkIfMoveLegal(gamefile, legalMoves, moveDraft.startCoords, endCoordsToAppendSpecial, onlinegame.getOpponentColor()); // Passes on any special moves flags to the endCoords

	specialdetect.transferSpecialFlags_FromCoordsToMove(endCoordsToAppendSpecial, moveDraft);
	const move = movesequence.makeMove(gamefile, mesh, moveDraft);
	if (gamefile.mesh.offset) movesequence.animateMove(move, true); // ONLY ANIMATE if the mesh has been generated. This may happen if the engine moves extremely fast on turn 1.

	selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.

	// Edit the clocks
	
	// Adjust the timer whos turn it is depending on ping.
	if (message.clockValues) message.clockValues = onlinegame.adjustClockValuesForPing(message.clockValues);
	clock.edit(gamefile, message.clockValues);
	guiclock.edit(gamefile);

	// For online games, the server is boss, so if they say the game is over, conclude it here.
	if (gamefileutility.isGameOver(gamefile)) gameslot.concludeGame();

	onlinegame.onMovePlayed({ isOpponents: true });
	guipause.onReceiveOpponentsMove(); // Update the pause screen buttons
}



export default {
	sendMove,
	handleOpponentsMove,
};
