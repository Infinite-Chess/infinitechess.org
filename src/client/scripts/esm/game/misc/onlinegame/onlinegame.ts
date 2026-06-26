// src/client/scripts/esm/game/misc/onlinegame/onlinegame.ts

/**
 * This module keeps trap of the data of the onlinegame we are currently in.
 */

import type { ServerGameInfo } from '../../../websocket/socketschemas.js';
import type { ClockValues, ParticipantState } from '../../../../../../shared/types.js';

import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';
import { isGameInstantlyDeleted } from '../../../../../../shared/chess/variants/servervalidation.js';

import gameslot from '../../chess/gameslot.js';
import socketsubs from '../../../websocket/socketsubs.js';
import disconnect from './disconnect.js';
import drawoffers from './drawoffers.js';
import pingManager from '../../../util/pingManager.js';
import { GameBus } from '../../GameBus.js';
import gamesession from '../../chess/gamesession.js';
import tabnameflash from './tabnameflash.js';
import { SocketBus } from '../../../websocket/SocketBus.js';
import socketmessages from '../../../websocket/socketmessages.js';

// Variables ------------------------------------------------------------------------------------------------------

/** The id of the online game we are in. */
let id: number | undefined;

/**
 * Whether we are in sync with the game on the server.
 * If false, we do not submit our move. (move will be auto-submitted upon resyncing)
 * Set to false whenever we lose connection, or the socket closes.
 * Set to true whenever we join game, or successfully resync.
 *
 * If we aren't subbed to a game, then it's automatically assumed we are out of sync.
 */
let inSync: boolean | undefined;

// Events -------------------------------------------------

SocketBus.addEventListener('reconnected', () => {
	resyncToGame();
});

GameBus.addEventListener('game-concluded', () => {
	tabnameflash.onGameClose();
	drawoffers.onGameClose();
	requestRemovalFromPlayersInActiveGames();
});

// Getters ------------------------------------------------------------

function areInSync(): boolean {
	return inSync!;
}

function setInSyncTrue(): void {
	inSync = true;
}

function setInSyncFalse(): void {
	inSync = false;
}

// Functions --------------------------------------------------

function initOnlineGame(options: {
	gameInfo: ServerGameInfo;
	/** Only provide if we're a participant of an ongoing game, not a spectator, or when the game is over! */
	participantState?: ParticipantState;
}): void {
	inSync = true;

	// Set static game properties that never change
	id = options.gameInfo.id;

	// If we are a participator, set the draw offers, disconnect timer, afk auto resign timer.
	set_DrawOffers_DisconnectInfo(options.participantState);

	tabnameflash.onGameStart({ isOurMove: gamesession.isItOurTurn() });

	initEventListeners();
}

function set_DrawOffers_DisconnectInfo(participantState?: ParticipantState): void {
	if (!participantState) return;

	drawoffers.set(participantState.drawOffer);

	// If opponent is currently disconnected, display that countdown
	if (participantState.disconnect)
		disconnect.startOpponentDisconnectCountdown(participantState.disconnect);
	else disconnect.stopOpponentDisconnectCountdown();
}

function initEventListeners(): void {
	// Add the event listeners for when we lose connection or the socket closes,
	// to set our inSync variable to false
	SocketBus.addEventListener('connection-lost', setInSyncFalse);
	SocketBus.addEventListener('closed', setInSyncFalse);

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

/**
 * Confirm that the user DOES actually want to leave the page if they are in an online game.
 *
 * Sometimes they could leave by accident, or even hit the "Logout" button by accident,
 * which just ejects them out of the game
 * @param event
 */
function confirmNavigationAwayFromGame(event: MouseEvent): void {
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

/**
 * Requests a game update from the server, since we are out of sync.
 */
function resyncToGame(): void {
	if (id === undefined) return console.error('Cannot resync to game, game id is undefined.');

	inSync = false;
	socketsubs.addSub('game'); // subs were cleared when the socket closed.
	socketmessages.send('game', 'resync', id);
}

function onMovePlayed({ isOpponents }: { isOpponents: boolean }): void {
	// Inform all the scripts that rely on online game
	// logic that a move occurred, so they can update accordingly
	tabnameflash.onMovePlayed({ isOpponents });
	drawoffers.onMovePlayed({ isOpponents });
}

function reportOpponentsMove(reason: string): void {
	// Send the move number of the opponents move so that there's no mixup of which move we claim is illegal.
	const opponentsMoveNumber = gameslot.getGamefile()!.moves.length + 1;

	const message = {
		reason,
		opponentsMoveNumber,
	};

	socketmessages.send('game', 'report', message);
}

/**  Called when the player presses the "Abort / Resign" button for the first time in an onlinegame. */
function onAbortOrResignButtonPress(): void {
	const gamefile = gameslot.getGamefile()!;
	if (moveutil.isGameResignable(gamefile)) socketmessages.send('game', 'resign');
	else socketmessages.send('game', 'abort');
}

/**
 * Lets the server know we have seen the game conclusion, and would
 * like to be allowed to join a new game if we leave quickly.
 *
 * THIS SHOULD ALSO be the point when the server knows we agree
 * with the resulting game conclusion (no cheating detected),
 * and the server may change the players elos!
 */
function requestRemovalFromPlayersInActiveGames(): void {
	if (!socketsubs.areSubbedToSub('game')) {
		// THE SERVER has deleted the game. Already removed from players in active games list!
		// console.log("Not sending request to remove from players in active games, because we are not subbed to the game.");
		return;
	}

	// Don't send this request if the server will have deleted this game instantly.
	const gamefile = gameslot.getGamefile()!;
	if (isGameInstantlyDeleted(gamefile.variant)) return;
	socketmessages.send('game', 'removefromplayersinactivegames');
}

/** Modifies the clock values to account for ping. */
function adjustClockValuesForPing(clockValues: ClockValues): void {
	if (!clockValues.colorTicking) return; // No clock is ticking (< 2 moves, or game is over), don't adjust for ping

	// console.log(`Adjusting clock values for ping. Ping is ${pingManager.getPing()}.`);

	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const halfPing = pingManager.getHalfPing();
	if (halfPing > 2500)
		console.error(
			'Ping is above 5000 milliseconds!!! This is a lot to adjust the clock values!',
		);
	// console.log(`Ping is ${halfPing * 2}. Subtracted ${halfPing} millis from ${clockValues.colorTicking}'s clock.`);

	if (clockValues.clocks[clockValues.colorTicking] === undefined)
		throw Error(
			`Invalid color "${clockValues.colorTicking}" to modify clock value to account for ping.`,
		);
	clockValues.clocks[clockValues.colorTicking]! -= halfPing;

	// Flag what time the player who's clock is ticking will lose on time.
	// Do this because while while the gamefile is being constructed, the time left may become innacurate.
	clockValues.timeColorTickingLosesAt =
		Date.now() + clockValues.clocks[clockValues.colorTicking]!;

	return;
}

// Exports -------------------------------------------------------------------------

export default {
	setInSyncTrue,
	initOnlineGame,
	set_DrawOffers_DisconnectInfo,
	areInSync,
	resyncToGame,
	onAbortOrResignButtonPress,
	reportOpponentsMove,
	onMovePlayed,
	adjustClockValuesForPing,
};
