
/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 * */


import type { DisconnectInfo, DrawOfferInfo } from '../onlinegamerouter.js';

import localstorage from '../../../util/localstorage.js';
import gamefileutility from '../../../chess/util/gamefileutility.js';
import colorutil from '../../../chess/util/colorutil.js';
import gameslot from '../../chess/gameslot.js';
import afk from './afk.js';
import tabnameflash from './tabnameflash.js';
import disconnect from './disconnect.js';
import serverrestart from './serverrestart.js';
import drawoffers from './drawoffers.js';
// @ts-ignore
import moveutil from '../../../chess/util/moveutil.js';
// @ts-ignore
import websocket from '../../websocket.js';


// Variables ------------------------------------------------------------------------------------------------------


/** Whether or not we are currently in an online game. */
let inOnlineGame: boolean = false;

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
 * If false, we do not submit our move. (move will be auto-submitted upon resyncing)
 * Set to false whenever we lose connection, or the socket closes.
 * Set to true whenever we join game, or successfully resync.
 * 
 * If we aren't subbed to a game, then it's automatically assumed we are out of sync.
 */
let inSync: boolean | undefined;


// Getters --------------------------------------------------------------------------------------------------------------


function areInOnlineGame(): boolean {
	return inOnlineGame;
}

/** Returns the game id of the online game we're in.  */
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

function areInSync(): boolean {
	if (!inOnlineGame) throw Error("Cannot get inSync of online game when we're not in an online game.");
	return inSync!;
}

/**
 * Different from {@link gamefileutility.isGameOver}, because this only returns true if {@link gamefileutility.concludeGame}
 * has been called, which IS ONLY called once the SERVER tells us the result of the game, not us!
 */
function hasServerConcludedGame(): boolean {
	if (!inOnlineGame) throw Error("Cannot get serverHasConcludedGame of online game when we're not in an online game.");
	return serverHasConcludedGame!;
}

function setInSyncTrue() {
	inSync = true;
}

function setInSyncFalse() {
	if (!inOnlineGame) return;
	inSync = false;
}


// Functions ------------------------------------------------------------------------------------------------------


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
	inOnlineGame = true;
	id = options.id;
	ourColor = options.youAreColor;
	isPrivate = options.publicity === 'private';
	inSync = true;

	set_DrawOffers_DisconnectInfo_AutoAFKResign_ServerRestarting(options);

	afk.onGameStart();

	tabnameflash.onGameStart({ isOurMove: isItOurTurn() });
    
	// These make sure it will place us in black's perspective
	// perspective.resetRotations();

	serverHasConcludedGame = false;

	initEventListeners();
}

function set_DrawOffers_DisconnectInfo_AutoAFKResign_ServerRestarting(options: {
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
	drawoffers.set(options.drawOffer);

	// If opponent is currently disconnected, display that countdown
	if (options.disconnect) disconnect.startOpponentDisconnectCountdown(options.disconnect);
	else disconnect.stopOpponentDisconnectCountdown();

	// If Opponent is currently afk, display that countdown
	if (options.millisUntilAutoAFKResign !== undefined) afk.startOpponentAFKCountdown(options.millisUntilAutoAFKResign);
	else afk.stopOpponentAFKCountdown();

	// If the server is restarting, start displaying that info.
	if (options.serverRestartingAt !== undefined) serverrestart.initServerRestart(options.serverRestartingAt);
	else serverrestart.resetServerRestarting();
}

// Call when we leave an online game
function closeOnlineGame() {
	inOnlineGame = false;
	id = undefined;
	isPrivate = undefined;
	ourColor = undefined;
	inSync = undefined;
	serverHasConcludedGame = undefined;
	afk.onGameClose();
	tabnameflash.onGameClose();
	serverrestart.onGameClose();
	drawoffers.onGameClose();
	// perspective.resetRotations(); // Without this, leaving an online game of which we were black, won't reset our rotation.
	closeEventListeners();
}

function initEventListeners() {
	// Add the event listeners for when we lose connection or the socket closes,
	// to set our inSync variable to false
	document.addEventListener('connection-lost', setInSyncFalse); // Custom event
	document.addEventListener('socket-closed', setInSyncFalse); // Custom event

	/**
	 * Leave-game warning popups on every hyperlink.
	 * 
	 * Add an listener for every single hyperlink on the page that will
	 * confirm to us if we actually want to leave if we are in an online game.
	 */
	document.querySelectorAll('a').forEach((link) => {
		link.addEventListener('click', confirmNavigationAwayFromGame);
	});
}

function closeEventListeners() {
	document.removeEventListener('connection-lost', setInSyncFalse);
	document.removeEventListener('socket-closed', setInSyncFalse);
	document.querySelectorAll('a').forEach((link) => {
		link.removeEventListener('click', confirmNavigationAwayFromGame);
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
	if (gamefileutility.isGameOver(gameslot.getGamefile()!)) return;

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

function update() {
	afk.updateAFK();
}

/**
 * Requests a game update from the server, since we are out of sync.
 */
function resyncToGame() {
	inSync = false;
	websocket.sendmessage('game', 'resync', id);
}

function onMovePlayed({ isOpponents }: { isOpponents: boolean}) {
	// Inform all the scripts that rely on online game
	// logic that a move occurred, so they can update accordingly
	afk.onMovePlayed({ isOpponents });
	tabnameflash.onMovePlayed({ isOpponents });
	drawoffers.onMovePlayed({ isOpponents });
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



// Aborts / Resigns
function onMainMenuPress() {
	if (!inOnlineGame) return;
	
	// Tell the server we no longer want game updates.
	// Just resigning isn't enough for the server
	// to deduce we don't want future game updates.
	websocket.unsubFromSub('game');
	
	if (serverHasConcludedGame) return; // Don't need to abort/resign, game is already over

	const gamefile = gameslot.getGamefile()!;
	if (moveutil.isGameResignable(gamefile)) websocket.sendmessage('game','resign');
	else 									 websocket.sendmessage('game','abort');
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
	requestRemovalFromPlayersInActiveGames();
}

function deleteCustomVariantOptions() {
	// Delete any custom pasted position in a private game.
	if (isPrivate) localstorage.deleteItem(id!);
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

export default {
	onmessage,
	getGameID,
	getIsPrivate,
	getOurColor,
	getOpponentColor,
	setInSyncTrue,
	initOnlineGame,
	set_DrawOffers_DisconnectInfo_AutoAFKResign_ServerRestarting,
	closeOnlineGame,
	isItOurTurn,
	areInSync,
	onMainMenuPress,
	resyncToGame,
	update,
	onGameConclude,
	hasServerConcludedGame,
	reportOpponentsMove,
	onMovePlayed,
	areInOnlineGame,
	areWeColorInOnlineGame,
};