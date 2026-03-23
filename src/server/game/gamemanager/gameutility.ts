// src/server/game/gamemanager/gameutility.ts

/**
 * This script contains our Game constructor for the server-side,
 * and contains many utility methods for working with them!
 *
 * At most this ever handles a single game, not multiple.
 */

import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { RatingData } from './ratingcalculation.js';
import type { VariantCode } from '../../../shared/chess/variants/variantdictionary.js';
import type { Board, Game } from '../../../shared/chess/logic/gamefile.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type {
	ClockValues,
	GameUpdateMessage,
	MetaData,
	OpponentsMoveMessage,
	ParticipantState,
	PlayerRatingChangeInfo,
	Rating,
	TimeControl,
} from '../../../shared/types.js';

import clock from '../../../shared/chess/logic/clock.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';

import servermetadatautil from '../servermetadatautil.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { memberInfoEq, Invite } from '../invitesmanager/inviteutility.js';
import { UNCERTAIN_LEADERBOARD_RD } from './ratingcalculation.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import { sendNotify, sendNotifyError, sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { doesColorHaveExtendedDrawOffer, getLastDrawOfferPlyOfColor } from './drawoffers.js';

// Constants ------------------------------------------------------------------------------------

/**
 * The cushion time, before the game is deleted, if one player
 * has disconnected and has not yet seen the game conclusion.
 * This gives them a little bit of time to reconnect and submit a cheat report,
 * which is only useful in variants where we're not doing server-side move validation.
 */
export const timeBeforeGameDeletionMillis = 1000 * 8;

// Types ----------------------------------------------------------------------------------------

/** Contains information about this player's disconnection and auto resign timer. */
type PlayerDisconnect = {
	/**
	 * The timeout id of the timer that will START the auto disconnection timer
	 * This is triggered if their socket unexpectedly closes,
	 * and lasts for 5 seconds to give them a chance to reconnect.
	 */
	startID?: NodeJS.Timeout;
	/**
	 * The epoch-ms timestamp when the 5-second reconnection cushion expires.
	 * Set alongside startID when the cushion timer is started.
	 * Used for persistence: on server restart, this allows reviving the cushion timer.
	 */
	startTime?: number;
} & (
	| {
			/**
			 * The timeout id of the timer that will auto-resign the
			 * player if they are disconnected for too long.
			 */
			timeoutID: NodeJS.Timeout;
			/**
			 * The estimated timestamp that the player will
			 * be auto-resigned from being disconnected too long.
			 */
			timeToAutoLoss: number;
			/**
			 * Whether the player was disconnected by choice or not.
			 * If not, they are given extra time to reconnect.
			 */
			wasByChoice: boolean;
	  }
	| {
			timeoutID: undefined;
			timeToAutoLoss: undefined;
			wasByChoice: undefined;
	  }
);

/** Information about a single player in an online game. */
interface PlayerData {
	/**
	 * The identifier of each color.
	 *
	 * If they are signed in, their identifier is `{ member: string }`, where member is their username.
	 * If they are signed out, their identifier is `{ browser: string }`, where browser is their browser-id cookie.
	 *
	 */
	identifier: AuthMemberInfo;
	/** Player's socket, if they are connected. */
	socket?: CustomWebSocket;
	/** The last move ply this player extended a draw offer, if they have. 0-based, where 0 is the start of the game. */
	lastOfferPly?: number;
	/** Contains information about this players disconnection and auto resign timer. */
	disconnect: PlayerDisconnect;
}

/** The info for the server hosting the game */
interface MatchInfo {
	/** The match's unique ID. This is also the same ID the game will have when logged to the database. */
	id: number;

	/** The variant code of the game being played. */
	variant: VariantCode;

	/** The time this match was created. The number of milliseconds that have elapsed since the Unix epoch. */
	timeCreated: number;
	/** The time this game ended, the game conclusion was set and the clocks were stopped serverside. The number of milliseconds that have elapsed since the Unix epoch. @type {number | undefined} */
	timeEnded?: number;
	/** Whether this match is "public" or "private". */
	publicity: 'public' | 'private';
	/** Whether the match is rated. */
	rated: boolean;
	/**
	 * The time control of the game (e.g. `"600+5"` or `"-"` for untimed).
	 * Guaranteed defined here because we can't read it from MetaData since it is optional there.
	 */
	clock: TimeControl;
	/** The data held for each player */
	playerData: PlayerGroup<PlayerData>;

	/** The ID of the timeout which will auto-lose the player
	 * whos turn it currently is when they run out of time. */
	autoTimeLossTimeoutID?: ReturnType<typeof setTimeout>;

	/** The ID of the timeout which will auto-lose the player
	 * whos turn it currently is if they go AFK too long. */
	autoAFKResignTimeoutID?: ReturnType<typeof setTimeout>;
	/** The time the current player will be auto-resigned by
	 * AFK if they are currently AFK. */
	autoAFKResignTime?: number;

	/** Whether a current draw offer is extended. If so, this is the color who extended it, otherwise null. */
	drawOfferState?: Player;

	/** The ID of the timer to delete the match after it has ended.
	 * This can be used to cancel it in case a hacking was reported. */
	deleteTimeoutID?: ReturnType<typeof setTimeout>;

	/**
	 * Whether a custom position was pasted in by either player.
	 * The game will NOT be logged, because it will crash if we try
	 * to paste it since we don't know the starting position.
	 */
	positionPasted: boolean;
}

/** The game stored in the server */
type ServerGame = {
	basegame: Game;
	match: MatchInfo;
	/**
	 * Used for server-side move legality validation.
	 * Present only for small variants.
	 */
	boardsim?: Board;
};

// Functions --------------------------------------------------------------------------------------

/**
 * Construct the match bject based on the invite options and how players have been assigned
 */
function initMatch(
	invite: Invite,
	id: number,
	assignedPlayers: PlayerGroup<{ identifier: AuthMemberInfo }>,
): MatchInfo {
	const playerData: MatchInfo['playerData'] = {};

	for (const [c, { identifier }] of Object.entries(assignedPlayers)) {
		playerData[Number(c) as Player] = {
			identifier,
			disconnect: {
				timeoutID: undefined,
				timeToAutoLoss: undefined,
				wasByChoice: undefined,
			},
		};
	}

	return {
		id,
		variant: invite.variant,
		playerData,
		timeCreated: Date.now(),
		publicity: invite.publicity,
		rated: invite.rated === 'rated',
		clock: invite.clock,
		positionPasted: false,
	};
}

/**
 * Assigns which player is what color, depending on the `color` property of the invite.
 *
 * WE MUST EXPLICITLY have arguments for each player, as otherwise a bug is introduced
 * if this is called with only 1 player!! And type safety doesn't catch it.
 * @param inviteColor - The color property of the invite. "Random" / "White" / "Black"
 * @param player1 - The first player (the invite owner).
 * @param player2 - The second player (the invite accepter).
 * @returns An object with 2 properties:
 * - `colorData`: An object mapping player color to player info
 * - `playerColors`: the colors of each player, in order of ascending player number.
 */
function assignWhiteBlackPlayersFromInvite(
	inviteColor: Player | null,
	player1: AuthMemberInfo,
	player2: AuthMemberInfo,
): PlayerGroup<AuthMemberInfo> {
	// { id, owner, variant, clock, color, rated, publicity }
	const colorData: PlayerGroup<AuthMemberInfo> = {};
	if (inviteColor === p.WHITE) {
		colorData[p.WHITE] = player1;
		colorData[p.BLACK] = player2;
	} else if (inviteColor === p.BLACK) {
		colorData[p.WHITE] = player2;
		colorData[p.BLACK] = player1;
	} else if (inviteColor === null) {
		// Random
		if (Math.random() > 0.5) {
			colorData[p.WHITE] = player1;
			colorData[p.BLACK] = player2;
		} else {
			colorData[p.WHITE] = player2;
			colorData[p.BLACK] = player1;
		}
	} else throw Error(`Unsupported color ${inviteColor} when assigning players to game.`);

	return colorData;
}

/**
 * Links their socket to this game, modifies their metadata.subscriptions, and sends them the game info.
 * @param servergame - The game they are a part of.
 * @param playerSocket - Their websocket.
 * @param playerColor - What color they are playing in this game. p.NEU
 * @param options - An object that may contain the option `sendGameInfo`, that when *true* won't send the game information over. Default: *true*
 * @param options.sendGameInfo
 * @param options.replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function subscribeClientToGame(
	servergame: ServerGame,
	playerSocket: CustomWebSocket,
	playerColor: Player,
	{ sendGameInfo = true, replyto }: { sendGameInfo?: boolean; replyto?: number } = {},
): void {
	const { match } = servergame;
	// 1. Attach their socket to the game for receiving updates
	const playerData = match.playerData[playerColor];
	if (playerData === undefined)
		return console.error(
			`Cannot subscribe client to game when game does not expect color ${playerColor} to be present`,
		);
	if (playerData.socket) {
		sendSocketMessage(playerData.socket, 'game', 'leavegame');
		unsubClientFromGame(match, playerData.socket);
	}
	playerData.socket = playerSocket;

	// 2. Modify their socket metadata to add the 'game', subscription,
	// and indicate what game the belong in and what color they are!
	playerSocket.metadata.subscriptions.game = {
		id: match.id,
		color: playerColor,
	};

	// 3. Send the game information, unless this is a reconnection,
	// at which point we verify if they are in sync
	if (sendGameInfo) sendGameInfoToPlayer(servergame, playerSocket, playerColor, replyto);
}

/**
 * Detaches the websocket from the game.
 * Updates the socket's subscriptions.
 * @param match
 * @param ws - Their websocket.
 */
function unsubClientFromGame(match: MatchInfo, ws: CustomWebSocket): void {
	if (ws.metadata.subscriptions.game === undefined) return; // Already unsubbed (they aborted)

	// 1. Detach their socket from the game so we no longer send updates
	delete match.playerData[ws.metadata.subscriptions.game.color]?.socket;

	// 2. Remove the game key-value pair from the sockets metadata subscription list.
	delete ws.metadata.subscriptions.game;
}

/**
 * Sends the game info to the player, the info they need to load the online game.
 *
 * Makes sure not to send sensitive info, such as player's browser-id cookies.
 * @param servergame - The game they're in.
 * @param playerSocket - Their websocket
 * @param playerColor - The color they are.
 * @param replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function sendGameInfoToPlayer(
	servergame: ServerGame,
	playerSocket: CustomWebSocket,
	playerColor: Player,
	replyto?: number,
): void {
	const ratings = getRatingDataForGamePlayers(
		servergame.match.playerData,
		servergame.match.variant,
	);

	const gameUpdateContents = getGameUpdateMessageContents(servergame, playerColor, false);

	const messageContents = {
		gameInfo: {
			id: servergame.match.id,
			rated: servergame.match.rated,
			publicity: servergame.match.publicity,
			playerRatings: ratings,
		},
		metadata: servergame.basegame.metadata,
		youAreColor: playerColor,
		...gameUpdateContents,
	};

	sendSocketMessage(playerSocket, 'game', 'joingame', messageContents, replyto);
}

/**
 * Returns the current elo of all players in the game on the leaderboard
 * of the variant being played, or the INFINITY leaderboard if the variant does not have a leaderboard.
 * @returns An object containing the rating for non-guests in the game, and whether we are confident in that rating, IF the variant has a leaderboard.
 */
function getRatingDataForGamePlayers(
	players: PlayerGroup<{ identifier: AuthMemberInfo }>,
	variant: VariantCode,
): PlayerGroup<Rating> {
	// Fallback to INFINITY leaderboard if the variant does not have a leaderboard.
	const leaderboardId = VariantLeaderboards[variant] ?? Leaderboards.INFINITY;

	const ratingData: PlayerGroup<Rating> = {};
	for (const [color, { identifier }] of Object.entries(players)) {
		if (!identifier.signedIn) continue; // Not a member, no rating to send
		const user_id = identifier.user_id;
		ratingData[Number(color) as Player] = getEloOfPlayerInLeaderboard(user_id, leaderboardId);
	}

	return ratingData;
}

/**
 * Generates metadata for a game including event details, player information, and timestamps.
 */
function constructMetadataOfGame(
	rated: boolean,
	variantKey: VariantCode,
	clock: TimeControl,
	dateTimestamp: number,
	playerdata: PlayerGroup<{ rating?: Rating; identifier: AuthMemberInfo }>,
): MetaData {
	const white = playerdata[p.WHITE]!.identifier;
	const black = playerdata[p.BLACK]!.identifier;
	const whiteIdentity = {
		name: white.signedIn ? white.username : metadatautil.GUEST_NAME_ICN_METADATA, // Protect browser's browser-id cookie
		id: white.signedIn ? white.user_id : undefined,
		elo: playerdata[p.WHITE]?.rating
			? metadatautil.getFormattedElo(playerdata[p.WHITE]!.rating!)
			: undefined,
	};
	const blackIdentity = {
		name: black.signedIn ? black.username : metadatautil.GUEST_NAME_ICN_METADATA, // Protect browser's browser-id cookie
		id: black.signedIn ? black.user_id : undefined,
		elo: playerdata[p.BLACK]?.rating
			? metadatautil.getFormattedElo(playerdata[p.BLACK]!.rating!)
			: undefined,
	};
	return servermetadatautil.buildGameMetadata(
		rated,
		variantKey,
		clock,
		dateTimestamp,
		whiteIdentity,
		blackIdentity,
	);
}

/**
 * Resyncs a client's websocket to a game. The client already
 * knows the game id and much other information. We only need to send
 * them the current move list, player timers, and game conclusion.
 * @param ws - Their websocket
 * @param servergame - The game
 * @param colorPlayingAs - Their color
 * @param [replyToMessageID] - If specified, the id of the incoming socket message this update will be the reply to
 */
function resyncToGame(
	ws: CustomWebSocket,
	servergame: ServerGame,
	colorPlayingAs: Player,
	replyToMessageID?: number,
): void {
	// If their socket isn't subscribed, connect them to the game!
	if (!ws.metadata.subscriptions.game)
		subscribeClientToGame(servergame, ws, colorPlayingAs, { sendGameInfo: false });

	// This function ALREADY sends all the information the client needs to resync!
	sendGameUpdateToColor(servergame, colorPlayingAs, false, { replyTo: replyToMessageID });
}

/**
 * Alerts both players in the game of the game conclusion if it has ended,
 * and the current moves list and timers.
 * @param servergame - The game
 */
function broadcastGameUpdate(servergame: ServerGame): void {
	for (const player in servergame.match.playerData) {
		sendGameUpdateToColor(servergame, Number(player) as Player, false);
	}
}

/**
 * Alerts the player of the specified color of the game conclusion if it has ended,
 * and the current moves list and timers.
 * @param servergame - The game
 * @param color - The color of the player
 * @param forceSync - If true, the client will force its move list to exactly match the server's (not re-submitting any extra move)
 * @param [options.replyTo] - If specified, the id of the incoming socket message this update will be the reply to
 */
function sendGameUpdateToColor(
	servergame: ServerGame,
	color: Player,
	forceSync: boolean,
	{ replyTo }: { replyTo?: number } = {},
): void {
	const playerdata = servergame.match.playerData[color];
	if (playerdata?.socket === undefined) return; // Not connected, can't send message

	const messageContents = getGameUpdateMessageContents(servergame, color, forceSync);
	sendSocketMessage(playerdata.socket, 'game', 'gameupdate', messageContents, replyTo);
}

/**
 * Constructs a gameupdate message UNIQUE to the player!
 * Unique because only one person receives the millisUntilAutoAFKResign
 * property - the opposite player of the one who has gone AFK.
 */
function getGameUpdateMessageContents(
	servergame: ServerGame,
	color: Player,
	forceSync: boolean,
): GameUpdateMessage {
	const messageContents: GameUpdateMessage = {
		gameConclusion: servergame.basegame.gameConclusion,
		moves: servergame.basegame.moves.map((m) => simplifyMove(m)),
		participantState: getParticipantState(
			servergame.match,
			color,
			servergame.basegame.whosTurn,
		),
		forceSync,
	};

	// Include timer info if it's timed
	if (!servergame.basegame.untimed)
		messageContents.clockValues = getGameClockValues(servergame.basegame);

	return messageContents;
}

/**
 * Alerts all players in the game of the rating changes of the game
 * @param match - The game
 * @param ratingdata - The rating data
 */
function sendRatingChangeToAllPlayers(match: MatchInfo, ratingdata: RatingData): void {
	const messageContents = getRatingChangeMessageContents(ratingdata);
	for (const playerdata of Object.values(match.playerData)) {
		if (playerdata.socket === undefined) continue; // Not connected, can't send message
		sendSocketMessage(playerdata.socket, 'game', 'gameratingchange', messageContents);
	}
}

/**
 * Calculates the json object we send to the client's containing the
 * rating changes from the results of the rated game.
 */
function getRatingChangeMessageContents(
	ratingdata: RatingData,
): PlayerGroup<PlayerRatingChangeInfo> {
	const messageContents: PlayerGroup<PlayerRatingChangeInfo> = {};
	for (const [playerStr, playerRating] of Object.entries(ratingdata)) {
		messageContents[Number(playerStr) as Player] = {
			newRating: {
				value: playerRating.elo_after_game!,
				confident: playerRating.rating_deviation_after_game! <= UNCERTAIN_LEADERBOARD_RD,
			},
			change: playerRating.elo_change_from_game!,
		};
	}

	return messageContents;
}

function getParticipantState(match: MatchInfo, color: Player, whosTurn: Player): ParticipantState {
	const opponentColor = typeutil.invertPlayer(color);
	const now = Date.now();
	const opponentData = match.playerData[opponentColor]!;

	const participantState: ParticipantState = {
		drawOffer: {
			unconfirmed: doesColorHaveExtendedDrawOffer(match, opponentColor), // True if our opponent has extended a draw offer we haven't yet confirmed/denied
			lastOfferPly: getLastDrawOfferPlyOfColor(match, color), // The move ply WE HAVE last offered a draw, if we have, otherwise undefined.
		},
	};

	// Include other relevant stuff if defined...

	// Only send AFK countdown to the opponent, not to the AFK player themselves.
	if (match.autoAFKResignTime !== undefined && color !== whosTurn) {
		const millisLeftUntilAutoAFKResign = match.autoAFKResignTime - now;
		participantState.millisUntilAutoAFKResign = millisLeftUntilAutoAFKResign;
	}

	// If their opponent has disconnected, send them that info too.
	if (opponentData.disconnect.timeToAutoLoss !== undefined) {
		participantState.disconnect = {
			millisUntilAutoDisconnectResign: opponentData.disconnect.timeToAutoLoss - now,
			wasByChoice: opponentData.disconnect.wasByChoice,
		};
	}

	return participantState;
}

/**
 * Tests if the given socket belongs in the game. If so, it returns the color they are.
 * @param match - The game
 * @param ws - The websocket
 * @returns The color they are, if they belong, otherwise *undefined*.
 */
function doesSocketBelongToGame_ReturnColor(
	match: MatchInfo,
	ws: CustomWebSocket,
): Player | undefined {
	if (match.id === ws.metadata.subscriptions.game?.id)
		return ws.metadata.subscriptions.game?.color;
	// Color isn't provided in their subscriptions, perhaps this is a resync/refresh?
	return doesPlayerBelongToGame_ReturnColor(match, ws.metadata.memberInfo);
}

/**
 * Tests if the given player belongs in the game. If so, it returns the color they are.
 * @param match - The game
 * @param player - The player object with one of 2 properties: `member` or `browser`, depending on if they are signed in.
 * @returns The color they are, if they belong, otherwise *false*.
 */
function doesPlayerBelongToGame_ReturnColor(
	match: MatchInfo,
	player: AuthMemberInfo,
): Player | undefined {
	for (const [splayer, data] of Object.entries(match.playerData)) {
		const playercolor = Number(splayer) as Player;
		if (memberInfoEq(player, data.identifier)) return playercolor;
	}
	return undefined;
}

/**
 * Sends a websocket message to the specified color in the game.
 * @param match - The game
 * @param color - The color of the player in this game to send the message to
 * @param sub - Where this message should be routed to, client side.
 * @param action - The action the client should perform. If sub is "general" and action is "notify" or "notifyerror", then this needs to be the key of the message in the TOML, and we will auto-translate it!
 * @param value - The value to send to the client.
 */
function sendMessageToSocketOfColor(
	match: MatchInfo,
	color: Player,
	sub: string,
	action: string,
	value?: any,
): void {
	const data = match.playerData[color];
	if (data === undefined) {
		logEventsAndPrint(
			`Tried to send a message to player ${color} when there isn't one in game!`,
			'errLog.txt',
		);
		return;
	}
	const ws = data.socket;
	if (!ws) return; // They are not connected, can't send message
	if (sub === 'general') {
		if (action === 'notify') return sendNotify(ws, value); // The value needs translating
		if (action === 'notifyerror') return sendNotifyError(ws, value); // The value needs translating
	}
	sendSocketMessage(ws, sub, action, value); // Value doesn't need translating, send normally.
}

/**
 * Safely prints a game to the console. Temporarily stringifies the
 * player sockets to remove self-referencing, and removes Node timers.
 * @param servergame - The game
 */
function printGame(servergame: ServerGame): void {
	const stringifiedGame = getSimplifiedGameString(servergame);
	console.log(JSON.parse(stringifiedGame)); // Turning it back into an object gives it a special formatting in the console, instead of just printing a string.
}

/**
 * Stringifies a game, by removing any recursion or Node timers from within, so it's JSON.stringify()'able.
 * @param servergame - The game
 * @returns The simplified game string
 */
function getSimplifiedGameString(servergame: ServerGame): string {
	// Only transfer interesting information.
	const players: PlayerGroup<AuthMemberInfo> = {};
	for (const [c, data] of Object.entries(servergame.match.playerData)) {
		players[Number(c) as Player] = data.identifier;
	}
	let moves: undefined | string[];
	if (servergame.basegame.moves.length > 0) moves = servergame.basegame.moves.map((m) => m.token);
	const simplifiedGame = {
		id: servergame.match.id,
		timeCreated: `${servergame.basegame.metadata.UTCDate} ${servergame.basegame.metadata.UTCTime}`,
		timeEnded: servergame.match.timeEnded,
		variant: servergame.match.variant,
		clock: servergame.basegame.metadata.TimeControl,
		rated: servergame.match.rated,
		players,
		moves,
	};

	return JSON.stringify(simplifiedGame);
}

/**
 * Returns *true* if the provided game has ended (gameConclusion truthy).
 * Games that are over are retained for a short period of time
 * to allow disconnected players to reconnect to see the results.
 * @param basegame - The game
 * @returns true if the game is over (gameConclusion truthy)
 */
function isGameOver(basegame: Game): boolean {
	return basegame.gameConclusion !== undefined;
}

/**
 * Returns true if the provided color has an actively running auto-resign timer.
 * NOT whether the 5-second reconnection cushion window timer has started.
 * @param match - The game they're in
 * @param color - The color they are in this game
 */
function isAutoResignDisconnectTimerActiveForColor(match: MatchInfo, color: Player): boolean {
	// If these are defined, then the timer is defined.
	return match.playerData[color]!.disconnect.timeToAutoLoss !== undefined;
}

/**
 * Sends the current clock values to the player who just moved.
 * @param servergame - The game
 */
function sendUpdatedClockToColor(servergame: ServerGame, color: Player): void {
	if (color !== p.BLACK && color !== p.WHITE) {
		logEventsAndPrint(
			`Color must be white or black when sending clock to color! Got: ${color}`,
			'errLog.txt',
		);
		return;
	}
	if (servergame.basegame.untimed) return; // Don't send clock values in an untimed game

	const message = getGameClockValues(servergame.basegame);
	const playerSocket = servergame.match.playerData[color]!.socket;
	if (!playerSocket) return; // They are not connected, can't send message
	sendSocketMessage(playerSocket, 'game', 'clock', message);
}

/**
 * Return the clock values of the servergame that can be sent to a client or logged.
 * It also includes who's clock is currently counting down, if one is.
 * This also updates the clocks, as the players current time should not be the same as when their turn first started.
 * @param basegame - The game
 */
function getGameClockValues(basegame: Game): ClockValues {
	if (basegame.untimed)
		throw new Error('Tried to get values of clocks from a game that had none!');
	updateClockValues(basegame);
	return clock.createEdit(basegame.clocks);
}

/**
 * Update the games clock values. This is NOT called after the clocks are pushed,
 * This is called right before we send clock information to the client,
 *  so that it's as accurate as possible.
 * @param basegame - The game
 */
function updateClockValues(basegame: Game): undefined {
	const now = Date.now();
	if (basegame.untimed || !isGameResignable(basegame) || isGameOver(basegame)) return;
	if (basegame.clocks.timeAtTurnStart === undefined)
		throw new Error('cannot update clock values when timeAtTurnStart is not defined!');

	const timeElapsedSinceTurnStart = now - basegame.clocks.timeAtTurnStart;
	const newTime = basegame.clocks.timeRemainAtTurnStart! - timeElapsedSinceTurnStart;
	const playerdata = basegame.clocks.currentTime;
	if (playerdata[basegame.whosTurn] === undefined) {
		logEventsAndPrint(
			`Cannot update games clock values when whose turn doesn't have a clock! "${basegame.whosTurn}"`,
			'errLog.txt',
		);
		return;
	}
	playerdata[basegame.whosTurn] = newTime;
	return;
}

/**
 * Sends a move to the player provided
 * @param servergame - The game
 * @param color - The color of the player to send the latest move to
 */
function sendMoveToColor({ basegame, match }: ServerGame, color: Player, move: MoveRecord): void {
	if (!(color in match.playerData)) {
		logEventsAndPrint(
			`Color to send move to must be one that is in the game (white or black)! ${color}`,
			'errLog.txt',
		);
		return;
	}

	const message: OpponentsMoveMessage = {
		move: simplifyMove(move),
		gameConclusion: basegame.gameConclusion,
		moveNumber: basegame.moves.length,
	};
	if (!basegame.untimed) message.clockValues = getGameClockValues(basegame);
	const sendToSocket = match.playerData[color]!.socket;
	if (!sendToSocket) return; // They are not connected, can't send message
	sendSocketMessage(sendToSocket, 'game', 'move', message);
}

/**
 * Simplifies a game's move into the minimal info needed for the client to reconstruct the move.
 */
function simplifyMove(move: MoveRecord): { token: string } {
	return { token: move.token };
}

/**
 * Cancel the timer to delete a game after it has ended if it is currently running.
 */
function cancelDeleteGameTimer(match: MatchInfo): void {
	clearTimeout(match.deleteTimeoutID);
}

/**
 * Tests if the game is resignable (at least 2 moves have been played).
 * If not, then the game is abortable.
 * @param basegame - The game
 * @returns *true* if the game is resignable.
 */
function isGameResignable(basegame: Game): boolean {
	return basegame.moves.length > 1;
}

/**
 * Tests if the game has just become resignable with the latest move (exactly 2 moves have been played).
 * @param basegame - The game
 * @returns *true* if the game has just become resignable after the last move.
 */
function isGameBorderlineResignable(basegame: Game): boolean {
	return basegame.moves.length === 2;
}

/**
 * Returns the color of the player that played that moveIndex within the moves list.
 * Returns error if index -1
 * @param basegame
 * @param i - The moveIndex
 * @returns - The color that played the moveIndex
 */
function getColorThatPlayedMoveIndex(basegame: Game, i: number): Player {
	const turnOrder = basegame.gameRules.turnOrder;
	if (i === -1) return turnOrder[turnOrder.length - 1]!;

	return turnOrder[i % turnOrder.length]!;
}

export type { ServerGame, MatchInfo, PlayerData, PlayerDisconnect };

export default {
	initMatch,
	subscribeClientToGame,
	unsubClientFromGame,
	resyncToGame,
	assignWhiteBlackPlayersFromInvite,
	constructMetadataOfGame,
	broadcastGameUpdate,
	sendGameUpdateToColor,
	sendRatingChangeToAllPlayers,
	doesSocketBelongToGame_ReturnColor,
	sendMessageToSocketOfColor,
	printGame,
	getSimplifiedGameString,
	isGameOver,
	isAutoResignDisconnectTimerActiveForColor,
	getGameClockValues,
	sendUpdatedClockToColor,
	sendMoveToColor,
	cancelDeleteGameTimer,
	isGameResignable,
	isGameBorderlineResignable,
	getColorThatPlayedMoveIndex,
	getRatingDataForGamePlayers,
};
