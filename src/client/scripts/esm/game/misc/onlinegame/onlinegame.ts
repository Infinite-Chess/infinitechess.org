
/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 * */


import type { ParticipantState, ServerGameInfo } from './onlinegamerouter.js';
import type { Player, PlayerGroup } from '../../../chess/util/typeutil.js';
import type { ClockValues } from '../../../chess/logic/clock.js';
import type { Rating } from '../../../../../../server/database/leaderboardsManager.js';

// @ts-ignore
import websocket from '../../websocket.js';
// @ts-ignore
import guipause from '../../gui/guipause.js';
import localstorage from '../../../util/localstorage.js';
import gamefileutility from '../../../chess/util/gamefileutility.js';
import gameslot from '../../chess/gameslot.js';
import afk from './afk.js';
import tabnameflash from './tabnameflash.js';
import disconnect from './disconnect.js';
import serverrestart from './serverrestart.js';
import drawoffers from './drawoffers.js';
import moveutil from '../../../chess/util/moveutil.js';
import pingManager from '../../../util/pingManager.js';


// Variables ------------------------------------------------------------------------------------------------------


/** Whether or not we are currently in an online game. */
let inOnlineGame: boolean = false;

/** The id of the online game we are in, if we are in one. */
let id: number | undefined;

/**
 * Whether the game is a private one (joined from an invite code).
 */
let isPrivate: boolean | undefined;

/**
 * Whether the game is rated.
 */
let rated: boolean | undefined;

/**
 * The color we are in the online game, if we are in it.
 */
let ourColor: Player | undefined;

/**
 * The ratings of the non-guest players in the game.
 * If the variant doesn't have a leaderboard, we fall back to the INFINITY leaderboard.
 */
let playerRatings: PlayerGroup<Rating> | undefined;

/**
 * Different from gamefile.basegame.gameConclusion, because this is only true if {@link gamefileutility.concludeGame}
 * has been called, which IS ONLY called once the SERVER tells us the result of the game, not us!
 */
let serverHasConcludedGame: boolean | undefined;

/**
 * Different from gamefile.basegame.gameConclusion, because this is true if the player has pressed the "Resign/Abort" button at some time during this game,
 * and NOT if the SERVER tells us that the game is concluded.
 */
let playerHasPressedAbortOrResignButton: boolean | undefined;

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
function getGameID(): number {
	if (!inOnlineGame) throw Error("Cannot get id of online game when we're not in an online game.");
	return id!;
}

function getIsPrivate(): boolean {
	if (!inOnlineGame) throw Error("Cannot get isPrivate of online game when we're not in an online game.");
	return isPrivate!;
}

function isRated(): boolean {
	if (!inOnlineGame) throw Error("Cannot ask if online game is rated when we're not in one.");
	return rated!;
}

/** Returns whether we are one of the players in the online game. */
function doWeHaveRole(): boolean {
	if (!inOnlineGame) throw Error("Cannot ask if we have a role in online game when we're not in an online game.");
	return ourColor !== undefined;
}

function getOurColor(): Player | undefined {
	if (!inOnlineGame) throw Error("Cannot get color we are in online game when we're not in an online game.");
	return ourColor; 
}

function getPlayerRatings(): PlayerGroup<Rating> | undefined {
	if (!inOnlineGame) throw Error("Cannot get player ratings when we're not in an online game.");
	return playerRatings;
}

function areWeColorInOnlineGame(color: Player): boolean {
	if (!inOnlineGame) return false; // Can't be that color, because we aren't even in a game.
	return ourColor === color;
}

function isItOurTurn(): boolean {
	if (!inOnlineGame) throw Error("Cannot get isItOurTurn of online game when we're not in an online game.");
	return gameslot.getGamefile()!.basegame.whosTurn === ourColor;
}

/** Whether we have pressed the Abort/Resign game button this game. NOT when it says main menu. */
function hasPlayerPressedAbortOrResignButton(): boolean {
	if (!inOnlineGame) throw Error("Cannot get playerHasPressedAbortOrResignButton of online game when we're not in an online game.");
	return playerHasPressedAbortOrResignButton!;
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
	gameInfo: ServerGameInfo
	/** Specify if we are a participant in the game, not a spectator. */
	youAreColor?: Player,
	/** Only provide if we're a participant of an ongoing game, not a spectator, or when the game is over! */
	participantState?: ParticipantState,
	/** If the server us restarting soon for maintenance, this is the time (on the server's machine) that it will be restarting. */
	serverRestartingAt?: number,
}) {
	inOnlineGame = true;
	inSync = true;

	// Set static game properties that never change
	id = options.gameInfo.id;
	rated = options.gameInfo.rated;
	isPrivate = options.gameInfo.publicity === 'private';
	playerRatings = options.gameInfo.playerRatings;

	ourColor = options.youAreColor;

	// If we are a participator, set the draw offers, disconnect timer, afk auto resign timer, and server restarting timer.
	set_DrawOffers_DisconnectInfo_AutoAFKResign_ServerRestarting(options.participantState, options.serverRestartingAt);

	afk.onGameStart();
	tabnameflash.onGameStart({ isOurMove: isItOurTurn() });

	serverHasConcludedGame = false;
	playerHasPressedAbortOrResignButton = false;

	initEventListeners();
}

function set_DrawOffers_DisconnectInfo_AutoAFKResign_ServerRestarting(participantState?: ParticipantState, serverRestartingAt?: number) {
	if (participantState) {
		drawoffers.set(participantState.drawOffer);

		// If opponent is currently disconnected, display that countdown
		if (participantState.disconnect) disconnect.startOpponentDisconnectCountdown(participantState.disconnect);
		else disconnect.stopOpponentDisconnectCountdown();

		// If Opponent is currently afk, display that countdown
		if (participantState.millisUntilAutoAFKResign !== undefined) afk.startOpponentAFKCountdown(participantState.millisUntilAutoAFKResign);
		else afk.stopOpponentAFKCountdown();
	}

	// If the server is restarting, start displaying that info.
	if (serverRestartingAt !== undefined) serverrestart.initServerRestart(serverRestartingAt);
	else serverrestart.resetServerRestarting();
}

// Call when we leave an online game
function closeOnlineGame() {
	inOnlineGame = false;
	id = undefined;
	isPrivate = undefined;
	rated = undefined;
	ourColor = undefined;
	inSync = undefined;
	serverHasConcludedGame = undefined;
	playerHasPressedAbortOrResignButton = undefined;
	afk.onGameClose();
	disconnect.stopOpponentDisconnectCountdown();
	tabnameflash.onGameClose();
	serverrestart.onGameClose();
	drawoffers.onGameClose();
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
 * @param event 
 */
function confirmNavigationAwayFromGame(event: MouseEvent) {
	// Check if Command (Meta) or Ctrl key is held down
	if (event.metaKey || event.ctrlKey) return; // Allow opening in a new tab without confirmation
	if (gamefileutility.isGameOver(gameslot.getGamefile()!.basegame)) return;

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
	if (!inOnlineGame) throw Error("Don't call resyncToGame() if not in an online game.");
	inSync = false;
	websocket.sendmessage('game', 'resync', id!);
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
	const opponentsMoveNumber = gameslot.getGamefile()!.basegame.moves.length + 1;

	const message = {
		reason,
		opponentsMoveNumber
	};

	websocket.sendmessage('game', 'report', message);
}

/**  Called when the player presses the "Abort / Resign" button for the first time in an onlinegame. */
function onAbortOrResignButtonPress() {
	if (!inOnlineGame) return;
	if (serverHasConcludedGame) return; // Don't need to abort/resign, game is already over
	if (playerHasPressedAbortOrResignButton) return; // Don't need to abort/resign, we have already done this during this game

	playerHasPressedAbortOrResignButton = true;

	const gamefile = gameslot.getGamefile()!;
	if (moveutil.isGameResignable(gamefile.basegame)) websocket.sendmessage('game','resign');
	else 									 websocket.sendmessage('game','abort');
}

/** 
 * Called when the player presses the "Main Menu" button in an onlinegame
 * This can happen if the game is already over or if the player has already pressed the "Abort / Resign" button.
 * This requests the server to stop serving us game updates, and allow us to join a new game.
 */
function onMainMenuButtonPress() {
	// Tell the server we no longer want game updates, if we are still receiving them.
	websocket.unsubFromSub('game');
	
	requestRemovalFromPlayersInActiveGames();
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
	if (isPrivate) localstorage.deleteItem(String(id!));
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

/**
 * Modifies the clock values to account for ping.
 */
function adjustClockValuesForPing(clockValues: ClockValues): ClockValues {
	if (!clockValues.colorTicking) return clockValues; // No clock is ticking (< 2 moves, or game is over), don't adjust for ping

	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const halfPing = pingManager.getHalfPing();
	if (halfPing > 2500) console.error("Ping is above 5000 milliseconds!!! This is a lot to adjust the clock values!");
	// console.log(`Ping is ${halfPing * 2}. Subtracted ${halfPing} millis from ${clockValues.colorTicking}'s clock.`);

	if (clockValues.clocks[clockValues.colorTicking] === undefined) throw Error(`Invalid color "${clockValues.colorTicking}" to modify clock value to account for ping.`);
	clockValues.clocks[clockValues.colorTicking]! -= halfPing;

	// Flag what time the player who's clock is ticking will lose on time.
	// Do this because while while the gamefile is being constructed, the time left may become innacurate.
	clockValues.timeColorTickingLosesAt = Date.now() + clockValues.clocks[clockValues.colorTicking]!;

	return clockValues;
}

/**
 * Returns the key that's put in local storage to store the variant options
 * of the current online game, if we have pasted a position in a private match.
 */
function getKeyForOnlineGameVariantOptions(gameID: number) {
	return `online-game-variant-options${gameID}`;
}


// Exports -------------------------------------------------------------------------


export default {
	onmessage,
	getGameID,
	getIsPrivate,
	isRated,
	doWeHaveRole,
	getOurColor,
	getPlayerRatings,
	setInSyncTrue,
	initOnlineGame,
	set_DrawOffers_DisconnectInfo_AutoAFKResign_ServerRestarting,
	closeOnlineGame,
	isItOurTurn,
	hasPlayerPressedAbortOrResignButton,
	areInSync,
	resyncToGame,
	update,
	onAbortOrResignButtonPress,
	onMainMenuButtonPress,
	onGameConclude,
	hasServerConcludedGame,
	reportOpponentsMove,
	onMovePlayed,
	areInOnlineGame,
	areWeColorInOnlineGame,
	adjustClockValuesForPing,
	getKeyForOnlineGameVariantOptions,
};