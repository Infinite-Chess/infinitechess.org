
/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 * */

import type gamefile from '../../../chess/logic/gamefile.js';
import type { Move } from '../../../chess/util/moveutil.js';
import type { WebsocketMessage } from '../../websocket.js';


import legalmoves from '../../../chess/logic/legalmoves.js';
import localstorage from '../../../util/localstorage.js';
import gamefileutility from '../../../chess/util/gamefileutility.js';
import drawoffers from '../drawoffers.js';
import guititle from '../../gui/guititle.js';
import clock from '../../../chess/logic/clock.js';
import guiclock from '../../gui/guiclock.js';
import statustext from '../../gui/statustext.js';
import movepiece from '../../../chess/logic/movepiece.js';
import specialdetect from '../../../chess/logic/specialdetect.js';
import selection from '../../chess/selection.js';
import board from '../../rendering/board.js';
import moveutil from '../../../chess/util/moveutil.js';
import websocket from '../../websocket.js';
import perspective from '../../rendering/perspective.js';
import sound from '../sound.js';
import guiplay from '../../gui/guiplay.js';
import input from '../../input.js';
import loadbalancer from '../loadbalancer.js';
import formatconverter from '../../../chess/logic/formatconverter.js';
import guipause from '../../gui/guipause.js';
import guigameinfo from '../../gui/guigameinfo.js';
import colorutil from '../../../chess/util/colorutil.js';
import jsutil from '../../../util/jsutil.js';
import config from '../../config.js';
import pingManager from '../../../util/pingManager.js';
import gameslot from '../../chess/gameslot.js';
import gameloader from '../../chess/gameloader.js';
import afk from './afk.js';
import { DisconnectInfo, DrawOfferInfo } from '../onlinegamerouter.js';
import tabnameflash from './tabnameflash.js';
import disconnect from './disconnect.js';
import serverrestart from './serverrestart.js';


// Variables ------------------------------------------------------------------------------------------------------


/** Whether or not we are currently in an online game. */
const inOnlineGame: boolean = false;

/**
 * The id of the online game we are in, if we are in one. @type {string}
 */
let id: string | undefined;

/**
 * Whether the game is a private one (joined from an invite code).
 */
let isPrivate: boolean | undefined;

/**
 * The color we are in the online game.
 */
let ourColor: 'white' | 'black' | undefined;

/**
 * Different from gamefile.gameConclusion, because this is only true if {@link gamefileutility.concludeGame}
 * has been called, which IS ONLY called once the SERVER tells us the result of the game, not us!
 */
let serverHasConcludedGame: boolean | undefined;

/**
 * Whether we are in sync with the game on the server.
 * If false, we do not submit our move. (move auto-submitted upon resyncing)
 * Set to false whenever the socket closes, or we unsub from the game.
 * Set to true whenever we join game, or successfully resync.
 */
let inSync: boolean | undefined;



// Functions ------------------------------------------------------------------------------------------------------


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
	if (!areInOnlineGame() || gamefileutility.isGameOver(gameslot.getGamefile()!)) return;

	const userConfirmed = confirm('Are you sure you want to leave the game?'); 
	if (userConfirmed) return; // Follow link like normal. Server then starts a 20-second auto-resign timer for disconnecting on purpose.
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


// Getters --------------------------------------------------------------------------------------------------------------


function areInOnlineGame(): boolean {
	return inOnlineGame;
}

/**
 * Returns the game id of the online game we're in.
 */
function getGameID(): string {
	if (!inOnlineGame) throw Error("Cannot get id of online game when we're not in an online game.");
	return id!;
}

function getIsPrivate(): boolean {
	if (!inOnlineGame) throw Error("Cannot get isPrivate of online game when we're not in an online game.");
	return isPrivate!;
}

function getOurColor(): 'white' | 'black' {
	if (!inOnlineGame) throw Error("Cannot get color we are in online game when we're not in an online game.");
	return ourColor!; 
}

function getOpponentColor(): 'white' | 'black' {
	return colorutil.getOppositeColor(ourColor!);
}

function areWeColorInOnlineGame(color: string): boolean {
	if (!inOnlineGame) return false; // Can't be that color, because we aren't even in a game.
	return ourColor === color;
}

function isItOurTurn(): boolean {
	if (!inOnlineGame) throw Error("Cannot get isItOurTurn of online game when we're not in an online game.");
	return gameslot.getGamefile()!.whosTurn === ourColor;
}

/**
 * Different from {@link gamefileutility.isGameOver}, because this only returns true if {@link gamefileutility.concludeGame}
 * has been called, which IS ONLY called once the SERVER tells us the result of the game, not us!
 */
function hasServerConcludedGame(): boolean {
	if (!inOnlineGame) throw Error("Cannot get serverHasConcludedGame of online game when we're not in an online game.");
	return serverHasConcludedGame!;
}




function setInSyncFalse() { inSync = false; }
function setInSyncTrue() { inSync = true; }







function update() {
	afk.updateAFK();
}

/**
 * Requests a game update from the server, since we are out of sync.
 */
function resyncToGame() {
	if (!areInOnlineGame()) return;
	function onReplyFunc() { inSync = true; }
	websocket.sendmessage('game', 'resync', id, false, onReplyFunc);
}

/**
 * Adds or deletes moves in the game until it matches the server's provided moves.
 * This can rarely happen when we move after the game is already over,
 * or if we're disconnected when our opponent made their move.
 * @param gamefile - The gamefile
 * @param moves - The moves list in the most compact form: `['1,2>3,4','5,6>7,8Q']`
 * @param claimedGameConclusion - The supposed game conclusion after synchronizing our opponents move
 * @returns A result object containg the property `opponentPlayedIllegalMove`. If that's true, we'll report it to the server.
 */
function synchronizeMovesList(gamefile: gamefile, moves: string[], claimedGameConclusion: string | false): { opponentPlayedIllegalMove: boolean } {

	// Early exit case. If we have played exactly 1 more move than the server,
	// and the rest of the moves list matches, don't modify our moves,
	// just re-submit our move!
	const hasOneMoreMoveThanServer = gamefile.moves.length === moves.length + 1;
	const finalMoveIsOurMove = gamefile.moves.length > 0 && moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1) === ourColor;
	const previousMoveMatches = (moves.length === 0 && gamefile.moves.length === 1) || gamefile.moves.length > 1 && moves.length > 0 && gamefile.moves[gamefile.moves.length - 2].compact === moves[moves.length - 1];
	if (!claimedGameConclusion && hasOneMoreMoveThanServer && finalMoveIsOurMove && previousMoveMatches) {
		console.log("Sending our move again after resyncing..");
		sendMove();
		return { opponentPlayedIllegalMove: false };
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

	const opponentColor = getOpponentColor();
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
				return { opponentPlayedIllegalMove: true };
			}

			afk.onMovePlayed({ isOpponents: true });
			tabnameflash.onMovePlayed({ isOpponents: true });
		} else tabnameflash.onMovePlayed({ isOpponents: false });
        
		const isLastMove = i === moves.length - 1;
		movepiece.makeMove(gamefile, move!, { doGameOverChecks: isLastMove, concludeGameIfOver: false, animate: isLastMove });
		console.log("Forwarded one move while resyncing to online game.");
		aChangeWasMade = true;
	}

	if (!aChangeWasMade) movepiece.rewindGameToIndex(gamefile, originalMoveIndex, { removeMove: false });
	else selection.reselectPiece(); // Reselect the selected piece from before we resynced. Recalc its moves and recolor it if needed.

	return { opponentPlayedIllegalMove: false }; // No cheating detected
}

function reportOpponentsMove(reason: string) {
	// Send the move number of the opponents move so that there's no mixup of which move we claim is illegal.
	const opponentsMoveNumber = gameslot.getGamefile()!.moves.length + 1;

	const message = {
		reason,
		opponentsMoveNumber
	};

	websocket.sendmessage('game', 'report', message);
}


function initOnlineGame(options: {
	/** The id of the online game */
	id: string,
	youAreColor: 'white' | 'black',
	publicity: 'public' | 'private',
	drawOffer: DrawOfferInfo,
	/** If our opponent has disconnected, this will be present. */
	disconnect?: DisconnectInfo,
	/**
	 * If our opponent is afk, this is how many millseconds left until they will be auto-resigned,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoAFKResign?: number,
	/** If the server us restarting soon for maintenance, this is the time (on the server's machine) that it will be restarting. */
	serverRestartingAt?: number,
}) {

	id = options.id;
	ourColor = options.youAreColor;
	isPrivate = options.publicity === 'private';

	drawoffers.set(options.drawOffer);
	

	if (options.disconnect) disconnect.startOpponentDisconnectCountdown(options.disconnect);
	afk.onGameStart();
	// If Opponent is currently afk, display that countdown
	if (options.millisUntilAutoAFKResign !== undefined) afk.startOpponentAFKCountdown(options.millisUntilAutoAFKResign);
	if (options.serverRestartingAt) serverrestart.initServerRestart(options.serverRestartingAt);

	tabnameflash.onGameStart({ isOurMove: isItOurTurn() });
    
	// These make sure it will place us in black's perspective
	// perspective.resetRotations();

	serverHasConcludedGame = false;

}

// Call when we leave an online game
function closeOnlineGame() {
	id = undefined;
	isPrivate = undefined;
	ourColor = undefined;
	inSync = false;
	serverHasConcludedGame = undefined;
	afk.onGameClose();
	tabnameflash.onGameClose();
	serverrestart.onGameClose();
	drawoffers.onGameClose();
	// perspective.resetRotations(); // Without this, leaving an online game of which we were black, won't reset our rotation.
}


function sendMove() {
	if (!inOnlineGame || !inSync) return; // Don't do anything if it's a local game
	if (config.DEV_BUILD) console.log("Sending our move..");

	const gamefile = gameslot.getGamefile()!;
	const shortmove = moveutil.getLastMove(gamefile.moves)!.compact; // "x,y>x,yN"

	const data = {
		move: shortmove,
		moveNumber: gamefile.moves.length,
		gameConclusion: gamefile.gameConclusion,
	};

	websocket.sendmessage('game', 'submitmove', data, true);

	// Declines any open draw offer from our opponent. We don't need to inform
	// the server because the server auto declines when we submit our move.
	drawoffers.callback_declineDraw({ informServer: false });
    
	afk.onMovePlayed({ isOpponents: false });
}

// Aborts / Resigns
function onMainMenuPress() {
	if (!inOnlineGame) return;
	
	// Tell the server we no longer want game updates.
	// Just resigning isn't enough for the server
	// to deduce we don't want future game updates.
	websocket.unsubFromSub('game');
	
	if (serverHasConcludedGame) return; // Don't need to abort/resign, game is already over

	const gamefile = gameslot.getGamefile()!;
	if (moveutil.isGameResignable(gamefile)) resign();
	else abort();
}

function resign() {
	inSync = false;
	websocket.sendmessage('game','resign');
}

function abort() {
	inSync = false;
	websocket.sendmessage('game','abort');
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
	if (!areInOnlineGame()) return;
	websocket.sendmessage('game', 'removefromplayersinactivegames');
}



/** Called when an online game is concluded (termination shown on-screen) */
function onGameConclude() {
	if (!inOnlineGame) return; // The game concluded wasn't an online game.

	serverHasConcludedGame = true; // This NEEDS to be above drawoffers.onGameClose(), as that relies on this!
	afk.onGameClose();
	tabnameflash.onGameClose();
	serverrestart.onGameClose();
	deleteCustomVariantOptions();
	drawoffers.onGameClose();
	onlinegame.requestRemovalFromPlayersInActiveGames();
}

function deleteCustomVariantOptions() {
	// Delete any custom pasted position in a private game.
	if (isPrivate) localstorage.deleteItem(id!);
}

function onReceivedOpponentsMove() {
	afk.onMovePlayed({ isOpponents: true });
	tabnameflash.onMovePlayed({ isOpponents: true });
}

export default {
	onmessage,
	getGameID,
	getIsPrivate,
	getOurColor,
	setInSyncFalse,
	setInSyncTrue,
	initOnlineGame,
	closeOnlineGame,
	isItOurTurn,
	sendMove,
	onMainMenuPress,
	requestRemovalFromPlayersInActiveGames,
	resyncToGame,
	update,
	onGameConclude,
	hasServerConcludedGame,
	reportOpponentsMove,
	onReceivedOpponentsMove,
	synchronizeMovesList,
	areInOnlineGame,
	areWeColorInOnlineGame,
};