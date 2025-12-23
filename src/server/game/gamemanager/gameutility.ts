/**
 * This script contains our Game constructor for the server-side,
 * and contains many utility methods for working with them!
 *
 * At most this ever handles a single game, not multiple.
 */

// Middleware & other imports
import { logEventsAndPrint } from '../../middleware/logEvents.js';
// @ts-ignore
import { getTranslation } from '../../utility/translate.js';

// Custom imports
import timeutil from '../../../shared/util/timeutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import uuid from '../../../shared/util/uuid.js';
import metadata from '../../../shared/chess/util/metadata.js';
import { memberInfoEq, Invite } from '../invitesmanager/inviteutility.js';
import { sendNotify, sendNotifyError, sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { players } from '../../../shared/chess/util/typeutil.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import { UNCERTAIN_LEADERBOARD_RD } from './ratingcalculation.js';
// @ts-ignore
import { getTimeServerRestarting } from '../timeServerRestarts.js';
// @ts-ignore
import { doesColorHaveExtendedDrawOffer, getLastDrawOfferPlyOfColor } from './drawoffers.js';
// @ts-ignore
import winconutil from '../../../shared/chess/util/winconutil.js';
import clock from '../../../shared/chess/logic/clock.js';

import type { Game } from '../../../shared/chess/logic/gamefile.js';
import type { BaseMove } from '../../../shared/chess/logic/movepiece.js';
import type { GameRules } from '../../../shared/chess/variants/gamerules.js';
import type { ClockValues } from '../../../shared/chess/logic/clock.js';
import type { AuthMemberInfo } from '../../types.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { MetaData } from '../../../shared/chess/util/metadata.js';
import type { Rating } from '../../database/leaderboardsManager.js';
import type { RatingData } from './ratingcalculation.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

// Type Definitions -----------------------------------------------------------------------------

type ServerGameMoveMessage = { compact: string; clockStamp?: number };

/** The message contents expected when we send a websocket 'move' message.  */
interface OpponentsMoveMessage {
	/** The move our opponent played. In the most compact notation: `"5,2>5,4"` */
	move: ServerGameMoveMessage;
	gameConclusion?: string;
	/** Our opponent's move number, 1-based. */
	moveNumber: number;
	/** If the game is timed, this will be the current clock values. */
	clockValues?: ClockValues;
}

/** The message contents expected when we receive a server websocket 'gameupdate' message.  */
interface GameUpdateMessage {
	gameConclusion?: string;
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`. */
	moves: ServerGameMoveMessage[];
	participantState: ParticipantState;
	clockValues?: ClockValues;
	/** If the server us restarting soon for maintenance, this is the time (on the server's machine) that it will be restarting. */
	serverRestartingAt?: number;
}

type PlayerRatingChangeInfo = {
	newRating: Rating;
	change: number;
};

interface DisconnectInfo {
	/**
	 * How many milliseconds left until our opponent will be auto-resigned from disconnection,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoDisconnectResign: number;
	/** Whether the opponent disconnected by choice, or if it was non-intentional (lost network). */
	wasByChoice: boolean;
}

/** Info storing draw offers of the game. */
interface DrawOfferInfo {
	/** True if our opponent has extended a draw offer we haven't yet confirmed/denied */
	unconfirmed: boolean;
	/** The move ply WE HAVE last offered a draw, if we have, otherwise undefined. */
	lastOfferPly?: number;
}

/** The state of the game unique to participants, while the game is ongoing, NOT for spectators, and not when the game is over. */
type ParticipantState = {
	drawOffer: DrawOfferInfo;
	/** If our opponent has disconnected, this will be present. */
	disconnect?: DisconnectInfo;
	/**
	 * If our opponent is afk, this is how many millseconds left until they will be auto-resigned,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoAFKResign?: number;
};

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
	disconnect: {
		/**
		 * The timeout id of the timer that will START the auto disconnection timer
		 * This is triggered if their socket unexpectedly closes,
		 * and lasts for 5 seconds to give them a chance to reconnect.
		 */
		startID?: NodeJS.Timeout;
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
}

interface MatchInfo {
	/** The match's unique ID */
	id: number;

	/** The time this match was created. The number of milliseconds that have elapsed since the Unix epoch. */
	timeCreated: number;
	/** The time this game ended, the game conclusion was set and the clocks were stopped serverside. The number of milliseconds that have elapsed since the Unix epoch. @type {number | undefined} */
	timeEnded?: number;
	/** Whether this match is "public" or "private". */
	publicity: 'public' | 'private';
	/** Whether the match is rated. */
	rated: boolean;
	/** */
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
	drawstate?: Player;

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

type ServerGame = { basegame: Game; match: MatchInfo };

// Functions --------------------------------------------------------------------------------------

/**
 * Construct a new online game from the invite options,
 * and subscribe the players to the game for receiving updates.
 *
 * Descriptions for each property can be found in the {@link Game} type definition.
 * @param invite - The invite that contain various settings for the game.
 * @param id - The unique identifier to give this game.
 * @param player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
 * @param player2Socket - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
 * @param replyto - The ID of the incoming socket message of player 2, accepting the invite. This is used for the `replyto` property on our response.
 * @returns The new game.
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
		playerData,
		timeCreated: Date.now(),
		publicity: invite.publicity,
		rated: invite.rated === 'rated',
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
	inviteColor: Player,
	player1: AuthMemberInfo,
	player2: AuthMemberInfo,
): PlayerGroup<AuthMemberInfo> {
	// { id, owner, variant, clock, color, rated, publicity }
	const colorData: PlayerGroup<AuthMemberInfo> = {};
	if (inviteColor === players.WHITE) {
		colorData[players.WHITE] = player1;
		colorData[players.BLACK] = player2;
	} else if (inviteColor === players.BLACK) {
		colorData[players.WHITE] = player2;
		colorData[players.BLACK] = player1;
	} else if (inviteColor === players.NEUTRAL) {
		// Random
		if (Math.random() > 0.5) {
			colorData[players.WHITE] = player1;
			colorData[players.BLACK] = player2;
		} else {
			colorData[players.WHITE] = player2;
			colorData[players.BLACK] = player1;
		}
	} else throw Error(`Unsupported color ${inviteColor} when assigning players to game.`);

	return colorData;
}

/**
 * Links their socket to this game, modifies their metadata.subscriptions, and sends them the game info.
 * @param game - The game they are a part of.
 * @param playerSocket - Their websocket.
 * @param playerColor - What color they are playing in this game. p.NEU
 * @param options - An object that may contain the option `sendGameInfo`, that when *true* won't send the game information over. Default: *true*
 * @param options.sendGameInfo
 * @param options.replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function subscribeClientToGame(
	game: ServerGame,
	playerSocket: CustomWebSocket,
	playerColor: Player,
	{ sendGameInfo = true, replyto }: { sendGameInfo?: boolean; replyto?: number } = {},
): void {
	const { match } = game;
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
	if (sendGameInfo) sendGameInfoToPlayer(game, playerSocket, playerColor, replyto);
}

/**
 * Detaches the websocket from the game.
 * Updates the socket's subscriptions.
 * @param game
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
 * @param game - The game they're in.
 * @param playerSocket - Their websocket
 * @param playerColor - The color they are.
 * @param replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function sendGameInfoToPlayer(
	game: ServerGame,
	playerSocket: CustomWebSocket,
	playerColor: Player,
	replyto?: number,
): void {
	const ratings = getRatingDataForGamePlayers(
		game.match.playerData,
		game.basegame.metadata.Variant!,
	);

	const gameUpdateContents = getGameUpdateMessageContents(game, playerColor);

	const messageContents = {
		gameInfo: {
			id: game.match.id,
			rated: game.match.rated,
			publicity: game.match.publicity,
			playerRatings: ratings,
		},
		metadata: game.basegame.metadata,
		youAreColor: playerColor,
		...gameUpdateContents,
	};

	sendSocketMessage(playerSocket, 'game', 'joingame', messageContents, replyto);
}

/**
 * Returns the current elo of all players in the game on the leaderboard
 * of the variant being played, or the INFINITY leaderboard if the variant does not have a leaderboard.
 * @param game
 * @returns An object containing the rating for non-guest in the game, and whether we are confident in that rating, IF the variant has a leaderboard.
 */
function getRatingDataForGamePlayers(
	players: PlayerGroup<{ identifier: AuthMemberInfo }>,
	variant: MetaData['Variant'] & string,
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
 * @param game - The game object containing details about the game.
 * @param ratings - Each players rating. Used to enter WhiteElo & BlackElo in the metadata.
 * @param ratingdata The rating data after their elos are changed after the game. Required IF you want WhiteRatingDiff & BlackRatingDiff in the metadata!
 * @returns An object containing metadata for the game including event name, players, time control, and UTC timestamps.
 */
function constructMetadataOfGame(
	rated: boolean,
	variant: string,
	clock: MetaData['TimeControl'],
	playerdata: PlayerGroup<{ rating?: Rating; identifier: AuthMemberInfo }>,
	ratingdata?: RatingData,
): MetaData {
	const RatedOrCasual = rated ? 'Rated' : 'Casual';
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(Date.now());
	const white = playerdata[players.WHITE]!.identifier;
	const black = playerdata[players.BLACK]!.identifier;
	const guest_indicator = getTranslation('play.javascript.guest_indicator');
	const gameMetadata: MetaData = {
		Event: `${RatedOrCasual} ${getTranslation(`play.play-menu.${variant}`)} infinite chess game`,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		Variant: variant,
		White: white.signedIn ? white.username : guest_indicator, // Protect browser's browser-id cookie
		Black: black.signedIn ? black.username : guest_indicator, // Protect browser's browser-id cookie
		TimeControl: clock,
		UTCDate,
		UTCTime,
	};
	if (white.signedIn) {
		// White is a member
		const base62 = uuid.base10ToBase62(white.user_id);
		gameMetadata.WhiteID = base62;
		if (playerdata[players.WHITE] !== undefined)
			gameMetadata.WhiteElo = metadata.getWhiteBlackElo(playerdata[players.WHITE]!.rating!);
	}
	if (black.signedIn) {
		// Black is a member
		const base62 = uuid.base10ToBase62(black.user_id);
		gameMetadata.BlackID = base62;
		if (playerdata[players.BLACK])
			gameMetadata.BlackElo = metadata.getWhiteBlackElo(playerdata[players.BLACK]!.rating!);
	}

	if (ratingdata) {
		// console.log("Rating data: ", ratingdata);
		// Include WhiteRatingDiff & BlackRatingDiff
		// Players may not be defined in the rating data if the game was aborted (no ratings changed)
		if (ratingdata[players.WHITE])
			gameMetadata.WhiteRatingDiff = metadata.getWhiteBlackRatingDiff(
				ratingdata[players.WHITE]!.elo_change_from_game!,
			);
		if (ratingdata[players.BLACK])
			gameMetadata.BlackRatingDiff = metadata.getWhiteBlackRatingDiff(
				ratingdata[players.BLACK]!.elo_change_from_game!,
			);
	}

	return gameMetadata;
}

/**
 * Resyncs a client's websocket to a game. The client already
 * knows the game id and much other information. We only need to send
 * them the current move list, player timers, and game conclusion.
 * @param ws - Their websocket
 * @param game - The game
 * @param colorPlayingAs - Their color
 * @param [replyToMessageID] - If specified, the id of the incoming socket message this update will be the reply to
 */
function resyncToGame(
	ws: CustomWebSocket,
	game: ServerGame,
	colorPlayingAs: Player,
	replyToMessageID?: number,
): void {
	// If their socket isn't subscribed, connect them to the game!
	if (!ws.metadata.subscriptions.game)
		subscribeClientToGame(game, ws, colorPlayingAs, { sendGameInfo: false });

	// This function ALREADY sends all the information the client needs to resync!
	sendGameUpdateToColor(game, colorPlayingAs, { replyTo: replyToMessageID });
}

/**
 * Alerts both players in the game of the game conclusion if it has ended,
 * and the current moves list and timers.
 * @param game - The game
 */
function broadcastGameUpdate(game: ServerGame): void {
	for (const player in game.match.playerData) {
		sendGameUpdateToColor(game, Number(player) as Player);
	}
}

/**
 * Alerts the player of the specified color of the game conclusion if it has ended,
 * and the current moves list and timers.
 * @param game - The game
 * @param color - The color of the player
 * @param options - Additional options
 * @param [options.replyTo] - If specified, the id of the incoming socket message this update will be the reply to
 */
function sendGameUpdateToColor(
	game: ServerGame,
	color: Player,
	{ replyTo }: { replyTo?: number } = {},
): void {
	const playerdata = game.match.playerData[color];
	if (playerdata?.socket === undefined) return; // Not connected, can't send message

	const messageContents = getGameUpdateMessageContents(game, color);
	sendSocketMessage(playerdata.socket, 'game', 'gameupdate', messageContents, replyTo);
}

function getGameUpdateMessageContents(game: ServerGame, color: Player): GameUpdateMessage {
	const messageContents: GameUpdateMessage = {
		gameConclusion: game.basegame.gameConclusion,
		moves: game.basegame.moves.map((m) => simplyMove(m)),
		participantState: getParticipantState(game.match, color),
	};

	// Include timer info if it's timed
	if (!game.basegame.untimed) messageContents.clockValues = getGameClockValues(game.basegame);

	// Also send the time the server is restarting, if it is
	const timeServerRestarting = getTimeServerRestarting();
	if (timeServerRestarting !== false) messageContents.serverRestartingAt = timeServerRestarting;

	return messageContents;
}

/**
 * Alerts all players in the game of the rating changes of the game
 * @param game - The game
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

function getParticipantState(match: MatchInfo, color: Player): ParticipantState {
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

	if (match.autoAFKResignTime !== undefined) {
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
 * @param game - The game
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
 * @param game - The game
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
 * @param game - The game
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
 * @param game - The game
 */
function printGame(game: ServerGame): void {
	const stringifiedGame = getSimplifiedGameString(game);
	console.log(JSON.parse(stringifiedGame)); // Turning it back into an object gives it a special formatting in the console, instead of just printing a string.
}

/**
 * Stringifies a game, by removing any recursion or Node timers from within, so it's JSON.stringify()'able.
 * @param game - The game
 * @returns The simplified game string
 */
function getSimplifiedGameString(game: ServerGame): string {
	// Only transfer interesting information.
	const players: PlayerGroup<AuthMemberInfo> = {};
	for (const [c, data] of Object.entries(game.match.playerData)) {
		players[Number(c) as Player] = data.identifier;
	}
	let moves: undefined | string[];
	if (game.basegame.moves.length > 0) moves = game.basegame.moves.map((m) => m.compact);
	const simplifiedGame = {
		id: game.match.id,
		timeCreated: `${game.basegame.metadata.UTCDate} ${game.basegame.metadata.UTCTime}`,
		timeEnded: game.match.timeEnded,
		variant: game.basegame.metadata.Variant,
		clock: game.basegame.metadata.TimeControl,
		rated: game.match.rated,
		players,
		moves,
	};

	return JSON.stringify(simplifiedGame);
}

/**
 * Returns *true* if the provided game has ended (gameConclusion truthy).
 * Games that are over are retained for a short period of time
 * to allow disconnected players to reconnect to see the results.
 * @param game - The game
 * @returns true if the game is over (gameConclusion truthy)
 */
function isGameOver(game: Game): boolean {
	return game.gameConclusion !== undefined;
}

/**
 * Returns true if the provided color has an actively running auto-resign timer.
 * NOT whether the 5-second reconnection cushion window timer has started.
 * @param game - The game they're in
 * @param color - The color they are in this game
 */
function isAutoResignDisconnectTimerActiveForColor(match: MatchInfo, color: Player): boolean {
	// If these are defined, then the timer is defined.
	return match.playerData[color]!.disconnect.timeToAutoLoss !== undefined;
}

/**
 * Sends the current clock values to the player who just moved.
 * @param game - The game
 */
function sendUpdatedClockToColor(game: ServerGame, color: Player): void {
	if (color !== players.BLACK && color !== players.WHITE) {
		logEventsAndPrint(
			`Color must be white or black when sending clock to color! Got: ${color}`,
			'errLog.txt',
		);
		return;
	}
	if (game.basegame.untimed) return; // Don't send clock values in an untimed game

	const message = getGameClockValues(game.basegame);
	const playerSocket = game.match.playerData[color]!.socket;
	if (!playerSocket) return; // They are not connected, can't send message
	sendSocketMessage(playerSocket, 'game', 'clock', message);
}

/**
 * Return the clock values of the game that can be sent to a client or logged.
 * It also includes who's clock is currently counting down, if one is.
 * This also updates the clocks, as the players current time should not be the same as when their turn first started.
 * @param game - The game
 */
function getGameClockValues(game: Game): ClockValues {
	if (game.untimed) throw new Error('Tried to get values of clocks from a game that had none!');
	updateClockValues(game);
	return clock.createEdit(game.clocks);
}

/**
 * Update the games clock values. This is NOT called after the clocks are pushed,
 * This is called right before we send clock information to the client,
 *  so that it's as accurate as possible.
 * @param game - The game
 */
function updateClockValues(game: Game): undefined {
	const now = Date.now();
	if (game.untimed || !isGameResignable(game) || isGameOver(game)) return;
	if (game.clocks.timeAtTurnStart === undefined)
		throw new Error('cannot update clock values when timeAtTurnStart is not defined!');

	const timeElapsedSinceTurnStart = now - game.clocks.timeAtTurnStart;
	const newTime = game.clocks.timeRemainAtTurnStart! - timeElapsedSinceTurnStart;
	const playerdata = game.clocks.currentTime;
	if (playerdata[game.whosTurn!] === undefined) {
		logEventsAndPrint(
			`Cannot update games clock values when whose turn doesn't have a clock! "${game.whosTurn}"`,
			'errLog.txt',
		);
		return;
	}
	playerdata[game.whosTurn!] = newTime;
	return;
}

/**
 * Sends a move to the player provided
 * @param game - The game
 * @param color - The color of the player to send the latest move to
 */
function sendMoveToColor({ basegame, match }: ServerGame, color: Player, move: BaseMove): void {
	if (!(color in match.playerData)) {
		logEventsAndPrint(
			`Color to send move to must be one that is in the game (white or black)! ${color}`,
			'errLog.txt',
		);
		return;
	}

	const message: OpponentsMoveMessage = {
		move: simplyMove(move),
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
function simplyMove(move: BaseMove): { compact: string } {
	return { compact: move.compact };
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
 * @param game - The game
 * @returns *true* if the game is resignable.
 */
function isGameResignable(game: Game): boolean {
	return game.moves.length > 1;
}

/**
 * Tests if the game has just become resignable with the latest move (exactly 2 moves have been played).
 * @param game - The game
 * @returns *true* if the game has just become resignable after the last move.
 */
function isGameBorderlineResignable(game: Game): boolean {
	return game.moves.length === 2;
}

/**
 * Returns the color of the player that played that moveIndex within the moves list.
 * Returns error if index -1
 * @param game
 * @param i - The moveIndex
 * @returns - The color that played the moveIndex
 */
function getColorThatPlayedMoveIndex(game: Game, i: number): Player {
	const turnOrder = game.gameRules.turnOrder;
	if (i === -1) return turnOrder[turnOrder.length - 1]!;

	return turnOrder[i % turnOrder.length]!;
}

/**
 * Returns the termination of the game in english language.
 * @param gameRules
 * @param condition - The 2nd half of the gameConclusion: checkmate/stalemate/repetition/moverule/insuffmat/allpiecescaptured/royalcapture/allroyalscaptured/resignation/time/aborted/disconnect
 */
function getTerminationInEnglish(gameRules: GameRules, condition: string): string {
	if (condition === 'moverule') {
		// One exception
		const numbWholeMovesUntilAutoDraw = gameRules.moveRule! / 2;
		return `${getTranslation('play.javascript.termination.moverule.0')}${numbWholeMovesUntilAutoDraw}${getTranslation('play.javascript.termination.moverule.1')}`;
	}
	return getTranslation(`play.javascript.termination.${condition}`);
}

function setConclusion(basegame: Game, conclusion: string | undefined): void {
	basegame.gameConclusion = conclusion;

	// Add on the Result and Termination metadata
	if (conclusion) {
		const { victor, condition } =
			winconutil.getVictorAndConditionFromGameConclusion(conclusion);
		basegame.metadata.Result = metadata.getResultFromVictor(victor);
		basegame.metadata.Termination = getTerminationInEnglish(basegame.gameRules, condition);
	} else {
		delete basegame.metadata.Result;
		delete basegame.metadata.Termination;
	}
}

export type {
	ServerGame,
	MatchInfo,
	PlayerData,
	PlayerRatingChangeInfo,
	OpponentsMoveMessage,
	ParticipantState,
	ServerGameMoveMessage,
	DrawOfferInfo,
	GameUpdateMessage,
};

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
	setConclusion,
};
