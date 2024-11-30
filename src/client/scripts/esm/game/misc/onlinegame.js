
// Import Start
import legalmoves from '../../chess/logic/legalmoves.js';
import localstorage from '../../util/localstorage.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import guinavigation from '../gui/guinavigation.js';
import drawoffers from './drawoffers.js';
import guititle from '../gui/guititle.js';
import clock from '../../chess/logic/clock.js';
import guiclock from '../gui/guiclock.js';
import statustext from '../gui/statustext.js';
import movepiece from '../../chess/logic/movepiece.js';
import game from '../chess/game.js';
import specialdetect from '../../chess/logic/specialdetect.js';
import selection from '../chess/selection.js';
import board from '../rendering/board.js';
import moveutil from '../../chess/util/moveutil.js';
import websocket from '../websocket.js';
import perspective from '../rendering/perspective.js';
import sound from './sound.js';
import guiplay from '../gui/guiplay.js';
import input from '../input.js';
import loadbalancer from './loadbalancer.js';
import formatconverter from '../../chess/logic/formatconverter.js';
import guipause from '../gui/guipause.js';
import guigameinfo from '../gui/guigameinfo.js';
import colorutil from '../../chess/util/colorutil.js';
import jsutil from '../../util/jsutil.js';
import config from '../config.js';
import pingManager from '../../util/pingManager.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js'} gamefile
 * @typedef {import('../../chess/util/moveutil.js').Move} Move
 * @typedef {import('../websocket.js').WebsocketMessage} WebsocketMessage
*/

"use strict";

/** This module keeps trap of the data of the onlinegame we are currently in. */

/** Whether we are currently in an online game. */
let inOnlineGame = false;
/** The id of the online game we are in, if we are in one. @type {string} */
let gameID;
/** Whether the game is a private one (joined from an invite code). */
let isPrivate;
let ourColor; // white/black
/**
 * Different from gamefile.gameConclusion, because this is only true if {@link gamefileutility.concludeGame}
 * has been called, which IS ONLY called once the SERVER tells us the result of the game, not us!
 */
let gameHasConcluded;

/**
 * Whether we are in sync with the game on the server.
 * If false, we do not submit our move. (move auto-submitted upon resyncing)
 * Set to false whenever the socket closes, or we unsub from the game.
 * Set to true whenever we join game, or successfully resync.
 */
let inSync = false;

/** Variables regardin the flashing of the tab's name "YOUR MOVE" when you're away. */
const tabNameFlash = {
	originalDocumentTitle: document.title,
	timeoutID: undefined,
	moveSound_timeoutID: undefined
};

/** All variables related to being afk and alerting the server of that */
const afk = {
	timeUntilAFKSecs: 40, // 40 + 20 = 1 minute
	timeUntilAFKSecs_Abortable: 20, // 20 + 20 = 40 seconds
	timeUntilAFKSecs_Untimed: 100, // 100 + 20 = 2 minutes
	/** The amount of time we have, in milliseconds, from the time we alert the
     * server we are afk, to the time we lose if we don't return. */
	timerToLossFromAFK: 20000,
	/** The ID of the timer to alert the server we are afk. */
	timeoutID: undefined,
	timeWeLoseFromAFK: undefined,
	/** The timeout ID of the timer to display the next "You are AFK..." message. */
	displayAFKTimeoutID: undefined,
	/** The timeout ID of the timer to play the next violin staccato note */
	playStaccatoTimeoutID: undefined,

	timeOpponentLoseFromAFK: undefined,
	/** The timeout ID of the timer to display the next "Opponent is AFK..." message. */
	displayOpponentAFKTimeoutID: undefined
};

/** All variables related to our opponent having disconnected */
const disconnect = {
	timeOpponentLoseFromDisconnect: undefined,
	/** The timeout ID of the timer to display the next "Opponent has disconnected..." message. */
	displayOpponentDisconnectTimeoutID: undefined
};

const serverRestart = {
	/** The time the server plans on restarting, if it has alerted us it is, otherwise false. */
	time: false,
	/** The minute intervals at which to display on screen the server is restarting. */
	keyMinutes: [30, 20, 15, 10, 5, 2, 1, 0],
	/** The timeout ID of the timer to display the next "Server restarting..." message.
     * This can be used to cancel the timer when the server informs us it's already restarted. */
	timeoutID: undefined
};



(function init() {
	addWarningLeaveGamePopupsToHyperlinks();
})();

/**
 * Add an listener for every single hyperlink on the page that will
 * confirm to us if we actually want to leave if we are in an online game.
 */
function addWarningLeaveGamePopupsToHyperlinks() {
	document.querySelectorAll('a').forEach((link) => {
		link.addEventListener('click', confirmNavigationAwayFromGame);
	});
}

/**
 * Confirm that the user DOES actually want to leave the page if they are in an online game.
 * 
 * Sometimes they could leave by accident, or even hit the "Logout" button by accident,
 * which just ejects them out of the game
 * @param {Event} event 
 */
function confirmNavigationAwayFromGame(event) {
	// Check if Command (Meta) or Ctrl key is held down
	if (event.metaKey || event.ctrlKey) return; // Allow opening in a new tab without confirmation
	if (!inOnlineGame || gamefileutility.isGameOver(game.getGamefile())) return;

	const userConfirmed = confirm('Are you sure you want to leave the game?'); 
	if (userConfirmed) return; // Follow link like normal. Server starts a 20-second auto-resign timer for disconnecting on purpose.
	// Cancel the following of the link.
	event.preventDefault();

	/*
	 * KEEP IN MIND that if we leave the pop-up open for 10 seconds,
	 * JavaScript is frozen in that timeframe, which means as
	 * far as the server can tell we're not communicating anymore,
	 * so it automatically closes our websocket connection,
	 * thinking we've disconnected, and starts a 60-second auto-resign timer.
	 * 
	 * As soon as we hit cancel, we are communicating again.
	 */
}



/**
 * Returns the game id of the online game we're in.
 * @returns {string}
 */
function getGameID() { return gameID; }

function areInOnlineGame() { return inOnlineGame; }

function getIsPrivate() { return isPrivate; }

function getOurColor() { return ourColor; }

/**
 * Different from {@link gamefileutility.isGameOver}, because this only returns true if {@link gamefileutility.concludeGame}
 * has been called, which IS ONLY called once the SERVER tells us the result of the game, not us!
 * @returns {boolean}
 */
function hasGameConcluded() { return gameHasConcluded; }

function setInSyncFalse() { inSync = false; }

function update() {
	if (!inOnlineGame) return;

	updateAFK();
}

function updateAFK() {
	if (!input.atleast1InputThisFrame() || game.getGamefile().gameConclusion) return;
	// Has been mouse movement, restart the afk auto-resign timer.
	if (afk.timeWeLoseFromAFK) tellServerWeBackFromAFK();
	rescheduleAlertServerWeAFK();
}

function rescheduleAlertServerWeAFK() {
	clearTimeout(afk.timeoutID);
	const gamefile = game.getGamefile();
	if (!isItOurTurn() || gamefileutility.isGameOver(gamefile) || isPrivate && clock.isGameUntimed(gamefile) || !clock.isGameUntimed(gamefile) && moveutil.isGameResignable(gamefile)) return;
	// Games with less than 2 moves played more-quickly start the AFK auto resign timer
	const timeUntilAFKSecs = !moveutil.isGameResignable(gamefile) ? afk.timeUntilAFKSecs_Abortable
        : clock.isGameUntimed(gamefile) ? afk.timeUntilAFKSecs_Untimed
            : afk.timeUntilAFKSecs;
	afk.timeoutID = setTimeout(tellServerWeAFK, timeUntilAFKSecs * 1000);
}

function cancelAFKTimer() {
	clearTimeout(afk.timeoutID);
	clearTimeout(afk.displayAFKTimeoutID);
	clearTimeout(afk.playStaccatoTimeoutID);
	clearTimeout(afk.displayOpponentAFKTimeoutID);
}

function tellServerWeAFK() {
	websocket.sendmessage('game','AFK');
	afk.timeWeLoseFromAFK = Date.now() + afk.timerToLossFromAFK;

	// Play lowtime alert sound
	sound.playSound_lowtime();

	// Display on screen "You are AFK. Auto-resigning in 20..."
	displayWeAFK(20);
	// The first violin staccato note is played in 10 seconds
	afk.playStaccatoTimeoutID = setTimeout(playStaccatoNote, 10000, 'c3', 10);
}

function tellServerWeBackFromAFK() {
	websocket.sendmessage('game','AFK-Return');
	afk.timeWeLoseFromAFK = undefined;
	clearTimeout(afk.displayAFKTimeoutID);
	clearTimeout(afk.playStaccatoTimeoutID);
	afk.displayAFKTimeoutID = undefined;
	afk.playStaccatoTimeoutID = undefined;
}

function displayWeAFK(secsRemaining) {
	const resigningOrAborting = moveutil.isGameResignable(game.getGamefile()) ? translations.onlinegame.auto_resigning_in : translations.onlinegame.auto_aborting_in;
	statustext.showStatusForDuration(`${translations.onlinegame.afk_warning} ${resigningOrAborting} ${secsRemaining}...`, 1000);
	const nextSecsRemaining = secsRemaining - 1;
	if (nextSecsRemaining === 0) return; // Stop
	const timeRemainUntilAFKLoss = afk.timeWeLoseFromAFK - Date.now();
	const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1000;
	afk.displayAFKTimeoutID = setTimeout(displayWeAFK, timeToPlayNextDisplayWeAFK, nextSecsRemaining);
}

function playStaccatoNote(note, secsRemaining) {
	if (note === 'c3') sound.playSound_viola_c3();
	else if (note === 'c4') sound.playSound_violin_c4();
	else return console.error("Invalid violin note");
    
	const nextSecsRemaining = secsRemaining > 5 ? secsRemaining - 1 : secsRemaining - 0.5;
	if (nextSecsRemaining === 0) return; // Stop
	const nextNote = nextSecsRemaining === Math.floor(nextSecsRemaining) ? 'c3' : 'c4';
	const timeRemainUntilAFKLoss = afk.timeWeLoseFromAFK - Date.now();
	const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1000;
	afk.playStaccatoTimeoutID = setTimeout(playStaccatoNote, timeToPlayNextDisplayWeAFK, nextNote, nextSecsRemaining);
}

/**
 * This is called whenever we lose connection.
 * This is NOT when a socket unexpectedly closes, this is when a socket
 * unexpectedly closes AND we are unable to establish a new one!
 */
function onLostConnection() {
	// Stop saying when the opponent will lose from being afk
	clearTimeout(afk.displayOpponentAFKTimeoutID);
}

/**
 * **Universal** function that is called when we receive a server websocket message with subscription marked `game`.
 * Joins online games, forwards received opponent's moves. Ends game after receiving resignation.
 * @param {WebsocketMessage} data - The incoming server websocket message
 */
function onmessage(data) { // { sub, action, value, id }
	// console.log(`Received ${data.action} from server! Message contents:`)
	// console.log(data.value)
	const message = 5;
	switch (data.action) {
		case "joingame":
			handleJoinGame(data.value);
			break;
		case "move":
			handleOpponentsMove(data.value);
			break;
		case "clock": { // Contain this case in a block so that it's variables are not hoisted 
			if (!inOnlineGame) return;
			const message = data.value; // { clockValues: { timerWhite, timerBlack } }
			message.clockValues.accountForPing = true; // We are in an online game so we need to inform the clock script to account for ping
			const gamefile = game.getGamefile();
			clock.edit(gamefile, message.clockValues); // Edit the clocks
			guiclock.edit(gamefile);
			break;
		} case "gameupdate": // When the game has ended by time/disconnect/resignation/aborted, OR we are resyncing to the game.
			handleServerGameUpdate(data.value);
			break;
		case "unsub": // The game has been deleted, server no longer sending update
			websocket.getSubs().game = false;
			inSync = false;
			break;
		case "login": // Not logged in error
			statustext.showStatus(translations.onlinegame.not_logged_in, true, 100);
			websocket.getSubs().game = false;
			inSync = false;
			clock.endGame(game.getGamefile());
			guiclock.stopClocks(game.getGamefile());
			game.getGamefile().gameConclusion = 'limbo';
			selection.unselectPiece();
			board.darkenColor();
			break;
		case "nogame": // Game is deleted / no longer exists
			statustext.showStatus(translations.onlinegame.game_no_longer_exists, false, 1.5);
			websocket.getSubs().game = false;
			inSync = false;
			game.getGamefile().gameConclusion = 'aborted';
			game.concludeGame();
			requestRemovalFromPlayersInActiveGames();
			break;
		case "leavegame": // Another window connected
			statustext.showStatus(translations.onlinegame.another_window_connected);
			websocket.getSubs().game = false;
			inSync = false;
			closeOnlineGame();
			game.unloadGame();
			guinavigation.close();
			guititle.open();
			break;
		case "opponentafk":
			startOpponentAFKCountdown(data.value.millisUntilAutoAFKResign);
			break;
		case "opponentafkreturn":
			stopOpponentAFKCountdown(data.value);
			break;
		case "opponentdisconnect":
			startOpponentDisconnectCountdown(data.value);
			break;
		case "opponentdisconnectreturn":
			stopOpponentDisconnectCountdown(data.value);
			break;
		case "serverrestart":
			initServerRestart(data.value);
			break;
		case "drawoffer": {
			drawoffers.onOpponentExtendedOffer();
			break;
		} case "declinedraw":
			statustext.showStatus(`Opponent declined draw offer.`);
			break;
		default:
			statustext.showStatus(`${translations.invites.unknown_action_received_1} ${message.action} ${translations.invites.unknown_action_received_2}`, true);
			break;
	}
}

function startOpponentAFKCountdown(millisUntilAutoAFKResign) {
	if (millisUntilAutoAFKResign === undefined) return console.error("Cannot display opponent is AFK when millisUntilAutoAFKResign not specified");
	// Cancel the previous one if this is overwriting
	stopOpponentAFKCountdown();

	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const halfPing = pingManager.getPing() / 2;
	const timeLeftMillis = millisUntilAutoAFKResign - halfPing;

	afk.timeOpponentLoseFromAFK = Date.now() + timeLeftMillis;
	// How much time is left? Usually starts at 20 seconds
	const secsRemaining = Math.ceil(timeLeftMillis / 1000);
	displayOpponentAFK(secsRemaining);
}

function stopOpponentAFKCountdown() {
	clearTimeout(afk.displayOpponentAFKTimeoutID);
	afk.displayOpponentAFKTimeoutID = undefined;
}

function displayOpponentAFK(secsRemaining) {
	const resigningOrAborting = moveutil.isGameResignable(game.getGamefile()) ? translations.onlinegame.auto_resigning_in : translations.onlinegame.auto_aborting_in;
	statustext.showStatusForDuration(`${translations.onlinegame.opponent_afk} ${resigningOrAborting} ${secsRemaining}...`, 1000);
	const nextSecsRemaining = secsRemaining - 1;
	if (nextSecsRemaining === 0) return; // Stop
	const timeRemainUntilAFKLoss = afk.timeOpponentLoseFromAFK - Date.now();
	const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1000;
	afk.displayOpponentAFKTimeoutID = setTimeout(displayOpponentAFK, timeToPlayNextDisplayWeAFK, nextSecsRemaining);
}

function startOpponentDisconnectCountdown({ autoDisconnectResignTime, wasByChoice } = {}) {
	if (!autoDisconnectResignTime) return console.error("Cannot display opponent has disconnected when autoResignTime not specified");
	if (wasByChoice === undefined) return console.error("Cannot display opponent has disconnected when wasByChoice not specified");
	// This overwrites the "Opponent is AFK" timer
	stopOpponentAFKCountdown();
	// Cancel the previous one if this is overwriting
	stopOpponentDisconnectCountdown();
	disconnect.timeOpponentLoseFromDisconnect = autoDisconnectResignTime;
	// How much time is left? Usually starts at 20 / 60 seconds
	const timeRemain = autoDisconnectResignTime - Date.now();
	const secsRemaining = Math.ceil(timeRemain / 1000);
	displayOpponentDisconnect(secsRemaining, wasByChoice);
}

function stopOpponentDisconnectCountdown() {
	clearTimeout(disconnect.displayOpponentDisconnectTimeoutID);
	disconnect.displayOpponentDisconnectTimeoutID = undefined;
}

function displayOpponentDisconnect(secsRemaining, wasByChoice) {
	const opponent_disconnectedOrLostConnection = wasByChoice ? translations.onlinegame.opponent_disconnected : translations.onlinegame.opponent_lost_connection;
	const resigningOrAborting = moveutil.isGameResignable(game.getGamefile()) ? translations.onlinegame.auto_resigning_in : translations.onlinegame.auto_aborting_in;
	// The "You are AFK" message should overwrite, be on top of, this message,
	// so if that is running, don't display this 1-second disconnect message, but don't cancel it either!
	if (!afk.timeWeLoseFromAFK) statustext.showStatusForDuration(`${opponent_disconnectedOrLostConnection} ${resigningOrAborting} ${secsRemaining}...`, 1000);
	const nextSecsRemaining = secsRemaining - 1;
	if (nextSecsRemaining === 0) return; // Stop
	const timeRemainUntilDisconnectLoss = disconnect.timeOpponentLoseFromDisconnect - Date.now();
	const timeToPlayNextDisplayOpponentDisconnect = timeRemainUntilDisconnectLoss - nextSecsRemaining * 1000;
	disconnect.displayOpponentDisconnectTimeoutID = setTimeout(displayOpponentDisconnect, timeToPlayNextDisplayOpponentDisconnect, nextSecsRemaining, wasByChoice);
}

function handleJoinGame(message) {
	// The server's message looks like:
	// {
	//     metadata: { Variant, White, Black, TimeControl, UTCDate, UTCTime, Rated },
	//	   clockValues: { timerWhite, timerBlack }
	//     id, clock, publicity, youAreColor, , moves, autoAFKResignTime, disconnect, gameConclusion, drawOffer,
	// }

	// We were auto-unsubbed from the invites list, BUT we want to keep open the socket!!
	const subs = websocket.getSubs();
	subs.invites = false;
	subs.game = true;
	inSync = true;
	guititle.close();
	guiplay.close();
	guiplay.startOnlineGame(message);
}

/**
 * Called when we received our opponents move. This verifies they're move
 * and claimed game conclusion is legal. If it isn't, it reports them and doesn't forward their move.
 * If it is legal, it forwards the game to the front, then forwards their move.
 * @param {Object} message - The server's socket message, with the properties `move`, `gameConclusion`, `moveNumber`, `clockValues`.
 */
function handleOpponentsMove(message) { // { move, gameConclusion, moveNumber, clockValues }
	if (!inOnlineGame) return;
	const moveAndConclusion = { move: message.move, gameConclusion: message.gameConclusion };
    
	// Make sure the move number matches the expected.
	// Otherwise, we need to re-sync
	const gamefile = game.getGamefile();
	const expectedMoveNumber = gamefile.moves.length + 1;
	if (message.moveNumber !== expectedMoveNumber) {
		console.log(`We have desynced from the game. Resyncing... Expected opponent's move number: ${expectedMoveNumber}. Actual: ${message.moveNumber}. Opponent's whole move: ${JSON.stringify(moveAndConclusion)}`);
		return resyncToGame();
	}

	// Convert the move from compact short format "x,y>x,yN"
	// to long format { startCoords, endCoords, promotion }
	/** @type {Move} */
	let move;
	try {
		move = formatconverter.ShortToLong_CompactMove(message.move); // { startCoords, endCoords, promotion }
	} catch {
		console.error(`Opponent's move is illegal because it isn't in the correct format. Reporting... Move: ${JSON.stringify(message.move)}`);
		const reason = 'Incorrectly formatted.';
		return reportOpponentsMove(reason);
	}

	// If not legal, this will be a string for why it is illegal.
	const moveIsLegal = legalmoves.isOpponentsMoveLegal(gamefile, move, message.gameConclusion);
	if (moveIsLegal !== true) console.log(`Buddy made an illegal play: ${JSON.stringify(moveAndConclusion)}`);
	if (moveIsLegal !== true && !isPrivate) return reportOpponentsMove(moveIsLegal); // Allow illegal moves in private games

	movepiece.forwardToFront(gamefile, { flipTurn: false, animateLastMove: false, updateProperties: false });

	// Forward the move...

	const piecemoved = gamefileutility.getPieceAtCoords(gamefile, move.startCoords);
	const legalMoves = legalmoves.calculate(gamefile, piecemoved);
	const endCoordsToAppendSpecial = jsutil.deepCopyObject(move.endCoords);
	legalmoves.checkIfMoveLegal(legalMoves, move.startCoords, endCoordsToAppendSpecial); // Passes on any special moves flags to the endCoords

	move.type = piecemoved.type;
	specialdetect.transferSpecialFlags_FromCoordsToMove(endCoordsToAppendSpecial, move);
	movepiece.makeMove(gamefile, move);

	selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.

	// Edit the clocks
	if (message.clockValues !== undefined) message.clockValues.accountForPing = true; // Set this to true so our clock knows to account for ping.
	clock.edit(gamefile, message.clockValues);
	guiclock.edit(gamefile);

	// For online games, we do NOT EVER conclude the game, so do that here if our opponents move concluded the game
	if (gamefileutility.isGameOver(gamefile)) {
		game.concludeGame();
		requestRemovalFromPlayersInActiveGames();
	}

	rescheduleAlertServerWeAFK();
	stopOpponentAFKCountdown(); // The opponent is no longer AFK if they were
	flashTabNameYOUR_MOVE(true);
	scheduleMoveSound_timeoutID();
	guipause.onReceiveOpponentsMove(); // Update the pause screen buttons
}

function flashTabNameYOUR_MOVE(on) {
	if (!loadbalancer.isPageHidden()) return document.title = tabNameFlash.originalDocumentTitle;

	document.title = on ? "YOUR MOVE" : tabNameFlash.originalDocumentTitle;
	tabNameFlash.timeoutID = setTimeout(flashTabNameYOUR_MOVE, 1500, !on);
}

function cancelFlashTabTimer() {
	document.title = tabNameFlash.originalDocumentTitle;
	clearTimeout(tabNameFlash.timeoutID);
	tabNameFlash.timeoutID = undefined;
}

function scheduleMoveSound_timeoutID() {
	if (!loadbalancer.isPageHidden()) return;
	if (!moveutil.isGameResignable(game.getGamefile())) return;
	const timeNextFlashFromNow = (afk.timeUntilAFKSecs * 1000) / 2;
	tabNameFlash.moveSound_timeoutID = setTimeout(() => { sound.playSound_move(0); }, timeNextFlashFromNow);
}

function cancelMoveSound() {
	clearTimeout(tabNameFlash.moveSound_timeoutID);
	tabNameFlash.moveSound_timeoutID = undefined;
}

function resyncToGame() {
	if (!inOnlineGame) return;
	function onReplyFunc() { inSync = true; }
	websocket.sendmessage('game', 'resync', gameID, false, onReplyFunc);
}

/**
 * Called when the server sends us the conclusion of the game when it ends,
 * OR we just need to resync! The game may not always be over.
 * @param {Object} messageContents - The contents of the server message, with the properties:
 * `gameConclusion`, `clockValues`, `moves`, `autoAFKResignTime`, `offerDraw`
 */
function handleServerGameUpdate(messageContents) { // { gameConclusion, clockValues: { timerWhite, timerBlack }, moves, autoAFKResignTime, offerDraw }
	if (!inOnlineGame) return;
	if (messageContents.clockValues !== undefined) messageContents.clockValues.accountForPing = true; // Set this too true so our clock knows to account for ping
	const gamefile = game.getGamefile();
	const claimedGameConclusion = messageContents.gameConclusion;

	/**
     * Make sure we are in sync with the final move list.
     * We need to do this because sometimes the game can end before the
     * server sees our move, but on our screen we have still played it.
     */
	if (!synchronizeMovesList(gamefile, messageContents.moves, claimedGameConclusion)) { // Cheating detected. Already reported, don't 
		stopOpponentAFKCountdown(); 
		return;
	}
	guigameinfo.updateWhosTurn(gamefile);

	// If Opponent is currently afk, display that countdown
	if (messageContents.autoAFKResignTime && !isItOurTurn()) startOpponentAFKCountdown(messageContents.autoAFKResignTime);
	else stopOpponentAFKCountdown();

	// If opponent is currently disconnected, display that countdown
	if (messageContents.disconnect) startOpponentDisconnectCountdown(messageContents.disconnect); // { autoDisconnectResignTime, wasByChoice }
	else stopOpponentDisconnectCountdown();

	// If the server is restarting, start displaying that info.
	if (messageContents.serverRestartingAt) initServerRestart(messageContents.serverRestartingAt);
	else resetServerRestarting();

	drawoffers.set(messageContents.drawOffer);

	// Must be set before editing the clocks.
	gamefile.gameConclusion = claimedGameConclusion;

	// When the game has ended by time/disconnect/resignation/aborted
	clock.edit(gamefile, messageContents.clockValues);

	if (gamefileutility.isGameOver(gamefile)) {
		game.concludeGame();
		requestRemovalFromPlayersInActiveGames();
	}
}

/**
 * Adds or deletes moves in the game until it matches the server's provided moves.
 * This can rarely happen when we move after the game is already over,
 * or if we're disconnected when our opponent made their move.
 * @param {gamefile} gamefile - The gamefile
 * @param {string[]} moves - The moves list in the most compact form: `['1,2>3,4','5,6>7,8Q']`
 * @param {string} claimedGameConclusion - The supposed game conclusion after synchronizing our opponents move
 * @returns {boolean} *false* if it detected an illegal move played by our opponent.
 */
function synchronizeMovesList(gamefile, moves, claimedGameConclusion) {

	// Early exit case. If we have played exactly 1 more move than the server,
	// and the rest of the moves list matches, don't modify our moves,
	// just re-submit our move!
	const hasOneMoreMoveThanServer = gamefile.moves.length === moves.length + 1;
	const finalMoveIsOurMove = gamefile.moves.length > 0 && moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1) === ourColor;
	const previousMoveMatches = (moves.length === 0 && gamefile.moves.length === 1) || gamefile.moves.length > 1 && moves.length > 0 && gamefile.moves[gamefile.moves.length - 2].compact === moves[moves.length - 1];
	if (!claimedGameConclusion && hasOneMoreMoveThanServer && finalMoveIsOurMove && previousMoveMatches) {
		console.log("Sending our move again after resyncing..");
		return sendMove();
	}

	const originalMoveIndex = gamefile.moveIndex;
	movepiece.forwardToFront(gamefile, { flipTurn: false, animateLastMove: false, updateProperties: false });
	let aChangeWasMade = false;

	while (gamefile.moves.length > moves.length) { // While we have more moves than what the server does..
		movepiece.rewindMove(gamefile, { animate: false });
		console.log("Rewound one move while resyncing to online game.");
		aChangeWasMade = true;
	}

	let i = moves.length - 1;
	while (true) { // Decrement i until we find the latest move at which we're in sync, agreeing with the server about.
		if (i === -1) break; // Beginning of game
		const thisGamefileMove = gamefile.moves[i];
		if (thisGamefileMove) { // The move is defined
			if (thisGamefileMove.compact === moves[i]) break; // The moves MATCH
			// The moves don't match... remove this one off our list.
			movepiece.rewindMove(gamefile, { animate: false });
			console.log("Rewound one INCORRECT move while resyncing to online game.");
			aChangeWasMade = true;
		}
		i--;
	}

	// i is now the index of the latest move that MATCHES in both ours and the server's moves lists.

	const opponentColor = getOpponentColor(ourColor);
	while (i < moves.length - 1) { // Increment i, adding the server's correct moves to our moves list
		i++;
		const thisShortmove = moves[i]; // '1,2>3,4Q'  The shortmove from the server's move list to add
		const move = movepiece.calculateMoveFromShortmove(gamefile, thisShortmove);

		const colorThatPlayedThisMove = moveutil.getColorThatPlayedMoveIndex(gamefile, i);
		const opponentPlayedThisMove = colorThatPlayedThisMove === opponentColor;


		if (opponentPlayedThisMove) { // Perform legality checks
			// If not legal, this will be a string for why it is illegal.
			const moveIsLegal = legalmoves.isOpponentsMoveLegal(gamefile, move, claimedGameConclusion);
			if (moveIsLegal !== true) console.log(`Buddy made an illegal play: ${thisShortmove} ${claimedGameConclusion}`);
			if (moveIsLegal !== true && !isPrivate) { // Allow illegal moves in private games
				reportOpponentsMove(moveIsLegal);
				return false;
			}

			rescheduleAlertServerWeAFK();
			stopOpponentAFKCountdown(); // The opponent is no longer AFK if they were
			flashTabNameYOUR_MOVE();
			scheduleMoveSound_timeoutID();
		} else cancelFlashTabTimer();
        
		const isLastMove = i === moves.length - 1;
		movepiece.makeMove(gamefile, move, { doGameOverChecks: isLastMove, concludeGameIfOver: false, animate: isLastMove });
		console.log("Forwarded one move while resyncing to online game.");
		aChangeWasMade = true;
	}

	if (!aChangeWasMade) movepiece.rewindGameToIndex(gamefile, originalMoveIndex, { removeMove: false });
	else selection.reselectPiece(); // Reselect the selected piece from before we resynced. Recalc its moves and recolor it if needed.

	return true; // No cheating detected
}

function reportOpponentsMove(reason) {
	// Send the move number of the opponents move so that there's no mixup of which move we claim is illegal.
	const opponentsMoveNumber = game.getGamefile().moves.length + 1;

	const message = {
		reason,
		opponentsMoveNumber
	};

	websocket.sendmessage('game', 'report', message);
}

/**
 * This has to be called before and separate from {@link initOnlineGame}
 * because loading the gamefile and the mesh generation requires this script to know our color.
 * @param {Object} gameOptions - An object that contains the properties `id`, `publicity`, `youAreColor`, `autoAFKResignTime`, `disconnect`, `serverRestartingAt`
 */
function setColorAndGameID(gameOptions) {
	inOnlineGame = true;
	ourColor = gameOptions.youAreColor;
	gameID = gameOptions.id;
	isPrivate = gameOptions.publicity === 'private';
	gameHasConcluded = false;
}

/**
 * Inits an online game according to the options provided by the server.
 * @param {Object} gameOptions - An object that contains the properties `id`, `publicity`, `youAreColor`, `autoAFKResignTime`, `disconnect`, `serverRestartingAt`
 */
function initOnlineGame(gameOptions) {
	rescheduleAlertServerWeAFK();
	// If Opponent is currently afk, display that countdown
	if (gameOptions.autoAFKResignTime) startOpponentAFKCountdown(gameOptions.autoAFKResignTime);
	if (gameOptions.disconnect) startOpponentDisconnectCountdown(gameOptions.disconnect);
	if (isItOurTurn()) {
		flashTabNameYOUR_MOVE(true);
		scheduleMoveSound_timeoutID();
	}
	if (gameOptions.serverRestartingAt) initServerRestart(gameOptions.serverRestartingAt);
    
	// These make sure it will place us in black's perspective
	perspective.resetRotations();
}

// Call when we leave an online game
function closeOnlineGame() {
	inOnlineGame = false;
	gameID = undefined;
	isPrivate = undefined;
	ourColor = undefined;
	inSync = false;
	gameHasConcluded = undefined;
	resetAFKValues();
	resetServerRestarting();
	cancelFlashTabTimer();
	perspective.resetRotations(); // Without this, leaving an online game of which we were black, won't reset our rotation.
	drawoffers.reset();
}

function resetAFKValues() {
	cancelAFKTimer();
	tabNameFlash.timeoutID = undefined;
	afk.timeoutID = undefined,
	afk.timeWeLoseFromAFK = undefined;
	afk.displayAFKTimeoutID = undefined,
	afk.playStaccatoTimeoutID = undefined,
	afk.displayOpponentAFKTimeoutID = undefined,
	afk.timeOpponentLoseFromAFK = undefined;
}

/**
 * Tests if it's our turn to move
 * @returns {boolean} *true* if it's currently our turn to move
 */
function isItOurTurn() { return game.getGamefile().whosTurn === ourColor; }

/**
 * Tests if we are this color in the online game.
 * @param {string} color - "white" / "black"
 * @returns {boolean} *true* if we are that color.
 */
function areWeColor(color) { return color === ourColor; }

function sendMove() {
	if (!inOnlineGame || !inSync) return; // Don't do anything if it's a local game
	if (config.DEV_BUILD) console.log("Sending our move..");

	const gamefile = game.getGamefile();

	const shortmove = moveutil.getLastMove(gamefile.moves).compact; // "x,y>x,yN"

	const data = {
		move: shortmove,
		moveNumber: gamefile.moves.length,
		gameConclusion: gamefile.gameConclusion,
	};

	websocket.sendmessage('game', 'submitmove', data, true);

	// Declines any open draw offer from our opponent. We don't need to inform
	// the server because the server auto declines when we submit our move.
	drawoffers.callback_declineDraw({ informServer: false });
    
	rescheduleAlertServerWeAFK();
}

// Aborts / Resigns
function onMainMenuPress() {
	if (!inOnlineGame) return;
	const gamefile = game.getGamefile();
	if (gameHasConcluded) { // The server has concluded the game, not us
		if (websocket.getSubs().game) {
			websocket.sendmessage('general','unsub','game');
			websocket.getSubs().game = false;
		}
		return;
	}

	if (moveutil.isGameResignable(gamefile)) resign();
	else abort();
}

function resign() {
	websocket.getSubs().game = false;
	inSync = false;
	websocket.sendmessage('game','resign');
}

function abort() {
	websocket.getSubs().game = false;
	inSync = false;
	websocket.sendmessage('game','abort');
}

function getOpponentColor() {
	return colorutil.getOppositeColor(ourColor);
}

/**
 * Opens a websocket, asks the server if we are in
 * a game to connect us to it and send us the game info.
 */
async function askServerIfWeAreInGame() {
	// The server only allows sockets if we are either logged in, or have a browser-id cookie.
	// browser-id cookies are issued/renewed on every html request.

	const messageContents = undefined;
	websocket.sendmessage('game', 'joingame', messageContents, true);
}

/**
 * Lets the server know we have seen the game conclusion, and would
 * like to be allowed to join a new game if we leave quickly.
 * 
 * THIS SHOULD ALSO be the point when the server knows we agree
 * with the resulting game conclusion (no cheating detected),
 * and the server may change the players elos!
 */
function requestRemovalFromPlayersInActiveGames() {
	if (!inOnlineGame) return;
	websocket.sendmessage('game', 'removefromplayersinactivegames');
}

function initServerRestart(timeToRestart) {
	if (serverRestart.time === timeToRestart) return; // We already know the server is restarting.
	resetServerRestarting(); // Overwrite the previous one, if it exists.
	serverRestart.time = timeToRestart;
	const timeRemain = timeToRestart - Date.now();
	const minutesLeft = Math.ceil(timeRemain / (1000 * 60));
	console.log(`Server has informed us it is restarting in ${minutesLeft} minutes!`);
	displayServerRestarting(minutesLeft);
}

/** Displays the next "Server restaring..." message, and schedules the next one. */
function displayServerRestarting(minutesLeft) {
	if (minutesLeft === 0) {
		statustext.showStatus(translations.onlinegame.server_restarting, false, 2);
		serverRestart.time = false;
		return; // Print no more server restarting messages
	}
	const minutes_plurality = minutesLeft === 1 ? translations.onlinegame.minute : translations.onlinegame.minutes;
	statustext.showStatus(`${translations.onlinegame.server_restarting_in} ${minutesLeft} ${minutes_plurality}...`, false, 2);
	let nextKeyMinute;
	for (const keyMinute of serverRestart.keyMinutes) {
		if (keyMinute < minutesLeft) {
			nextKeyMinute = keyMinute;
			break;
		}
	}
	const timeToDisplayNextServerRestart = serverRestart.time - nextKeyMinute * 60 * 1000;
	const timeUntilDisplayNextServerRestart = timeToDisplayNextServerRestart - Date.now();
	serverRestart.timeoutID = setTimeout(displayServerRestarting, timeUntilDisplayNextServerRestart, nextKeyMinute);
}

/** Cancels the timer to display the next "Server restaring..." message, and resets the values. */
function resetServerRestarting() {
	serverRestart.time = false;
	clearTimeout(serverRestart.timeoutID);
	serverRestart.timeoutID = undefined;
}

function deleteCustomVariantOptions() {
	// Delete any custom pasted position in a private game.
	if (isPrivate) localstorage.deleteItem(gameID);
}

/** Called when an online game is concluded (termination shown on-screen) */
function onGameConclude() {
	gameHasConcluded = true; // This NEEDS to be above drawoffers.reset(), as that relies on this!
	cancelAFKTimer();
	cancelFlashTabTimer();
	cancelMoveSound();
	resetServerRestarting();
	deleteCustomVariantOptions();
	drawoffers.reset();
}

export default {
	onmessage,
	areInOnlineGame,
	getIsPrivate,
	getOurColor,
	setInSyncFalse,
	setColorAndGameID,
	initOnlineGame,
	closeOnlineGame,
	isItOurTurn,
	areWeColor,
	sendMove,
	onMainMenuPress,
	getGameID,
	askServerIfWeAreInGame,
	requestRemovalFromPlayersInActiveGames,
	resyncToGame,
	update,
	onLostConnection,
	cancelMoveSound,
	onGameConclude,
	hasGameConcluded
};