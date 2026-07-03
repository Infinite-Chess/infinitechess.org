// src/server/game/gamemanager/gameutility.ts

/**
 * This script contains our Game constructor for the server-side,
 * and contains many utility methods for working with them!
 *
 * At most this ever handles a single game, not multiple.
 */

import type { Board } from '../../../shared/chess/logic/boardinit.js';
import type { GameRules } from '../../../shared/chess/util/gamerules.js';
import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { RatingData } from './ratingcalculation.js';
import type { VariantCode } from '../../../shared/chess/variants/variantregistry.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Game, LoadedVariant } from '../../../shared/chess/logic/gamefile.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type {
	AuthSeekVariant,
	ClockValues,
	FullGameState,
	StaticGameState,
	GameUpdateBase,
	GameUpdateMessage,
	MetaData,
	MovePacket,
	OpponentsMoveMessage,
	ParticipantState,
	PlayerRatingChangeInfo,
	Rating,
	ServerUsernameContainer,
	SubscribedGameState,
	TimeControl,
} from '../../../shared/types.js';

import uuid from '../../../shared/util/uuid.js';
import clock from '../../../shared/chess/logic/clock.js';
import timeutil from '../../../shared/util/timeutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import boardinit from '../../../shared/chess/logic/boardinit.js';
import movepiece from '../../../shared/chess/logic/movepiece.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import variantregistry from '../../../shared/chess/variants/variantregistry.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import {
	Leaderboards,
	VariantLeaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';

import tconfig from '../../config/translationconfig.js';
import { memberInfoEq } from '../../utility/memberInfoUtil.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { getScriptTranslations } from '../../config/componentTranslationLoader.js';
import { UNCERTAIN_LEADERBOARD_RD } from './ratingcalculation.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import { buildServerUsernameContainer } from '../seeksmanager/seekutility.js';
import { sendNotify, sendNotifyError, sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { doesColorHaveExtendedDrawOffer, getLastDrawOfferPlyOfColor } from './drawoffers.js';

// Constants ------------------------------------------------------------------------------------

/**
 * The cushion time, before the game is deleted, if one player
 * has disconnected and has not yet seen the game conclusion.
 * This gives them a little bit of time to reconnect and submit a cheat report,
 * which is only useful in variants where we're not doing server-side move validation.
 */
export const timeBeforeFinalizeMillis = 1000 * 8;

// Types ----------------------------------------------------------------------------------------

/** Contains information about this player's disconnection and claim-window timer. */
type PlayerDisconnect = {
	/**
	 * The timeout id of the timer that will OPEN the opponent's claim window.
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
			 * The epoch-ms timestamp from which the OPPONENT is allowed to claim
			 * victory or a draw against this disconnected player. The claim is
			 * validated on-demand against this timestamp when it arrives. Once
			 * this is in the past, the opponent's claim window is open.
			 */
			timeOpponentMayClaim: number;
			/**
			 * Whether the player was disconnected by choice or not.
			 * If not, they are given extra time to reconnect.
			 */
			wasByChoice: boolean;
	  }
	| {
			timeOpponentMayClaim: undefined;
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

	/** Whether a current draw offer is extended. If so, this is the color who extended it, otherwise null. */
	drawOfferState?: Player;

	/**
	 * Whether the game is finalized: its result is permanent and locked in — logged to the
	 * database, ratings applied, cheat reports no longer accepted, and it can never change.
	 * A finalized game may still linger in memory to host the post-game rematch handshake
	 * until both players leave (after which it is evicted).
	 */
	finalized: boolean;

	/**
	 * The colors that have an outstanding rematch offer post-conclusion. When both are
	 * present, a rematch game is created. Ephemeral — never persisted (lost on restart).
	 */
	rematchOffers: Set<Player>;

	/**
	 * The ID of the timer that finalizes (locks in + logs) the game's result after it ends.
	 * Only used by games without server-side validation, to give a cushion for cheat reports
	 * to overturn the result first. Can be cancelled if the game is finalized/evicted early.
	 */
	finalizeTimeoutID?: ReturnType<typeof setTimeout>;

	/**
	 * The ID of the timer that concludes the game once BOTH players have been
	 * disconnected for too long (neither is present to claim victory/draw).
	 * Started when the second player disconnects; cancelled if either reconnects.
	 */
	bothDisconnectedTimeoutID?: ReturnType<typeof setTimeout>;
	/**
	 * The epoch-ms timestamp the {@link bothDisconnectedTimeoutID} timer fires.
	 * Persisted so the timer can be revived (or fired) on server restart.
	 */
	bothDisconnectedEndTime?: number;
}

/** The game stored in the server */
type ServerGame = Game & {
	match: MatchInfo;
	/** Determines turn order, win conditions, promotion, etc. */
	gameRules: GameRules;
	/** The color whose turn it currently is at the front of the game. */
	whosTurn: Player;
	/** Sockets spectating this game (non-participants). */
	spectators: Set<CustomWebSocket>;
} & ValidationDependant;

/** The servergame variables that depend on whether the server is performing legal move validation. */
type ValidationDependant =
	| ({
			/**
			 * Whether the server is performing move validation for this game.
			 * If present, board state is fully tracked.
			 * True only for small variants.
			 * This also determines whether the server game is instantly deleted or not after conclusion.
			 */
			validateMoves: true;
	  } & Board)
	| {
			validateMoves: false;
			moves: MoveRecord[];
	  };

// Functions --------------------------------------------------------------------------------------

/**
 * The properties needed to start a game, distilled from either an accepted seek or an
 * existing game being rematched. Kept minimal so both paths can share {@link initMatch}.
 */
interface GameSetup {
	variant: AuthSeekVariant;
	time: TimeControl;
	rated: boolean;
}

/**
 * Construct the match object based on the game setup and how players have been assigned
 */
function initMatch(
	setup: GameSetup,
	id: number,
	assignedPlayers: PlayerGroup<{ identifier: AuthMemberInfo }>,
): MatchInfo {
	const playerData: MatchInfo['playerData'] = {};

	for (const [c, { identifier }] of Object.entries(assignedPlayers)) {
		playerData[Number(c) as Player] = {
			identifier,
			disconnect: {
				timeOpponentMayClaim: undefined,
				wasByChoice: undefined,
			},
		};
	}

	if (setup.variant.kind !== 'preset')
		throw new Error('Custom variant game starting is not yet implemented.');

	return {
		id,
		variant: setup.variant.code,
		playerData,
		timeCreated: Date.now(),
		rated: setup.rated,
		clock: setup.time,
		finalized: false,
		rematchOffers: new Set(),
	};
}

/**
 * Constructs a ServerGame from an initialized game and match.
 * Handles both validated (board-tracked) and non-validated variants.
 * Pass an existing moves list to replay them (e.g. on server restore); omit for a fresh game.
 */
function initServerGame(
	gameWithRules: Game & { gameRules: GameRules },
	match: MatchInfo,
	validateMoves: boolean,
	variant: LoadedVariant,
	moves: MoveRecord[] = [],
): ServerGame {
	if (validateMoves) {
		const boardsim = boardinit.initBoard(gameWithRules.gameRules, variant);
		if (moves.length > 0) movepiece.makeAllMovesInGame(boardsim, moves);
		return { ...gameWithRules, match, ...boardsim, spectators: new Set(), validateMoves: true };
	} else {
		return {
			...gameWithRules,
			match,
			whosTurn:
				gameWithRules.gameRules.turnOrder[
					moves.length % gameWithRules.gameRules.turnOrder.length
				]!,
			moves,
			spectators: new Set(),
			validateMoves: false,
		};
	}
}

/**
 * Assigns which player is what color, depending on the `color` property of the seek.
 *
 * WE MUST EXPLICITLY have arguments for each player, as otherwise a bug is introduced
 * if this is called with only 1 player!! And type safety doesn't catch it.
 * @param seekColor - The color property of the seek. "Random" / "White" / "Black"
 * @param player1 - The first player (the seek owner).
 * @param player2 - The second player (the seek accepter).
 * @returns An object with 2 properties:
 * - `colorData`: An object mapping player color to player info
 * - `playerColors`: the colors of each player, in order of ascending player number.
 */
function assignWhiteBlackPlayersFromSeek(
	seekColor: Player | null,
	player1: AuthMemberInfo,
	player2: AuthMemberInfo,
): PlayerGroup<AuthMemberInfo> {
	// { id, owner, variant, clock, color, rated }
	const colorData: PlayerGroup<AuthMemberInfo> = {};
	if (seekColor === p.WHITE) {
		colorData[p.WHITE] = player1;
		colorData[p.BLACK] = player2;
	} else if (seekColor === p.BLACK) {
		colorData[p.WHITE] = player2;
		colorData[p.BLACK] = player1;
	} else if (seekColor === null) {
		// Random
		if (Math.random() > 0.5) {
			colorData[p.WHITE] = player1;
			colorData[p.BLACK] = player2;
		} else {
			colorData[p.WHITE] = player2;
			colorData[p.BLACK] = player1;
		}
	} else throw Error(`Unsupported color ${seekColor} when assigning players to game.`);

	return colorData;
}

/**
 * Links their socket to this game and modifies their metadata.subscriptions.
 * @param servergame - The game they are a part of.
 * @param playerSocket - Their websocket.
 * @param playerColor - What color they are playing in this game.
 */
function subscribeClientToGame(
	servergame: ServerGame,
	playerSocket: CustomWebSocket,
	playerColor: Player,
): void {
	const match = servergame.match;
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
 * Sends a participant the `gamestate` message: the role-agnostic
 * {@link FullGameState} plus their per-player overlay.
 * @param servergame - The game they're in.
 * @param ws - Their websocket.
 * @param color - The color they are.
 * @throws If a database error occurs (from {@link produceFullGameState}).
 */
function sendParticipantGameState(
	servergame: ServerGame,
	ws: CustomWebSocket,
	color: Player,
): void {
	const value: SubscribedGameState = {
		...produceFullGameState(servergame),
		participantState: getParticipantState(servergame, color),
	};
	sendSocketMessage(ws, 'game', 'gamestate', value);
}

/**
 * Returns the current elo of all players in the game on the leaderboard
 * of the variant being played, or the INFINITY leaderboard if the variant does not have a leaderboard.
 * @returns An object containing the rating for non-guests in the game, and whether we are confident in that rating, IF the variant has a leaderboard.
 * @throws If a database error occurs (from {@link getEloOfPlayerInLeaderboard}).
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
 * Assembles the role-agnostic {@link StaticGameState} of a live game.
 * This is all the properties that are unchanging since the
 * game's inception, live or dead, EXCEPT for the gameConclusion.
 * @throws If a database error occurs (from {@link getRatingDataForGamePlayers}).
 */
function buildStaticGameState(servergame: ServerGame): StaticGameState {
	const match = servergame.match;
	const ratings = getRatingDataForGamePlayers(match.playerData, match.variant);

	const players: PlayerGroup<ServerUsernameContainer> = {};
	for (const [p, data] of Object.entries(match.playerData)) {
		const color = Number(p) as Player;
		players[color] = buildServerUsernameContainer(data.identifier, ratings[color]);
	}

	const state: StaticGameState = {
		id: match.id,
		rated: match.rated,
		// initMatch rejects non-preset seeks, so a live game's variant is always a preset code right now.
		variant: { kind: 'preset', code: match.variant },
		timeControl: match.clock,
		timeCreated: match.timeCreated,
		players,
	};

	if (servergame.gameConclusion !== undefined) state.gameConclusion = servergame.gameConclusion;

	return state;
}

/**
 * Produces the canonical role-agnostic {@link FullGameState} for a live game, sent
 * to clients on subscribe. The per-viewer `participantState` overlay is layered on
 * separately at delivery time, not here.
 * @throws If a database error occurs (from {@link getRatingDataForGamePlayers}).
 */
function produceFullGameState(servergame: ServerGame): FullGameState {
	const state: FullGameState = {
		...buildStaticGameState(servergame),
		moves: servergame.moves.map((m) => simplifyMove(m)),
	};

	if (!servergame.untimed) state.clockValues = getGameClockValues(servergame);

	return state;
}

/**
 * Assembles the ICN {@link MetaData} of a game on demand from its properties
 * (`match`, `gameConclusion`, ratings). Built only for serialization (ICN logging)
 * — never stored on the game. Metadata is always in English.
 * @param ratingData - Present for a concluded rated game: supplies the pre-calc display
 *   elos + rating diffs. Absent otherwise, in which case display elos are read live from
 *   the leaderboard ("rating immediately before the new rating was calculated").
 */
function buildMetadataOfGame(servergame: ServerGame, ratingData?: RatingData): MetaData {
	const { match } = servergame;

	// Resolve each player's display rating: from the pre-calc snapshot
	// when logging a rated game, else read live from the leaderboard.
	const ratings: PlayerGroup<Rating> = {};
	if (ratingData) {
		for (const [color, rd] of Object.entries(ratingData)) {
			ratings[Number(color) as Player] = {
				value: rd.elo_at_game,
				confident: rd.rating_deviation_at_game <= UNCERTAIN_LEADERBOARD_RD,
			};
		}
	} else {
		Object.assign(ratings, getRatingDataForGamePlayers(match.playerData, match.variant));
	}

	const white = match.playerData[p.WHITE]!.identifier;
	const black = match.playerData[p.BLACK]!.identifier;
	const scriptT = getScriptTranslations('shared', tconfig.DEFAULT_LANGUAGE); // Game metadata should only ever be in English
	const variantEnglishName = variantregistry.getVariantName(match.variant, scriptT);
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(match.timeCreated);

	const metadata: MetaData = {
		Event: `${match.rated ? 'Rated' : 'Casual'} ${variantEnglishName} infinite chess game`,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		Variant: variantEnglishName,
		White: white.signedIn ? white.username : metadatautil.GUEST_NAME_ICN_METADATA, // Protect browser's browser-id cookie
		Black: black.signedIn ? black.username : metadatautil.GUEST_NAME_ICN_METADATA,
		TimeControl: match.clock,
		UTCDate,
		UTCTime,
	};

	// ID + display elo, present only for signed-in players.
	if (white.signedIn) {
		metadata.WhiteID = uuid.base10ToBase62(white.user_id);
		if (ratings[p.WHITE]) metadata.WhiteElo = metadatautil.getFormattedElo(ratings[p.WHITE]!);
	}
	if (black.signedIn) {
		metadata.BlackID = uuid.base10ToBase62(black.user_id);
		if (ratings[p.BLACK]) metadata.BlackElo = metadatautil.getFormattedElo(ratings[p.BLACK]!);
	}

	if (servergame.gameConclusion) {
		metadata.Result = metadatautil.getResultFromVictor(servergame.gameConclusion.victor);
		metadata.Termination = winconutil.getTerminationInEnglish(
			servergame.gameRules,
			servergame.gameConclusion.condition,
		);
	}
	if (ratingData) {
		metadata.WhiteRatingDiff = metadatautil.getWhiteBlackRatingDiff(
			ratingData[p.WHITE]!.elo_change_from_game!,
		);
		metadata.BlackRatingDiff = metadatautil.getWhiteBlackRatingDiff(
			ratingData[p.BLACK]!.elo_change_from_game!,
		);
	}

	return metadata;
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
	if (!ws.metadata.subscriptions.game) subscribeClientToGame(servergame, ws, colorPlayingAs);

	// This function ALREADY sends all the information the client needs to resync!
	sendGameUpdateToColor(servergame, colorPlayingAs, false, { replyTo: replyToMessageID });
}

/**
 * Alerts both participants (not spectators) of the game conclusion if it has ended,
 * and the current moves list and timers. Each gets a per-player participant overlay.
 * Participants-only because it carries the move list for desync resync (a participant's
 * in-flight move can race a conclusion); spectators are read-only and can't desync.
 * @param servergame - The game
 */
function broadcastParticipantGameUpdate(servergame: ServerGame): void {
	// Build the agnostic core once; only the per-player participant overlay differs.
	const base = buildGameUpdateBase(servergame, false);
	for (const [color, data] of Object.entries(servergame.match.playerData)) {
		if (data.socket === undefined) continue; // Not connected, can't send message
		const message: GameUpdateMessage = {
			...base,
			participantState: getParticipantState(servergame, Number(color) as Player),
		};
		sendSocketMessage(data.socket, 'game', 'gameupdate', message);
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

/** Builds the agnostic core of a gameupdate, identical for every recipient. */
function buildGameUpdateBase(servergame: ServerGame, forceSync: boolean): GameUpdateBase {
	const base: GameUpdateBase = {
		gameConclusion: servergame.gameConclusion,
		moves: servergame.moves.map((m) => simplifyMove(m)),
		forceSync,
	};
	if (!servergame.untimed) base.clockValues = getGameClockValues(servergame);
	return base;
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
	return {
		...buildGameUpdateBase(servergame, forceSync),
		participantState: getParticipantState(servergame, color),
	};
}

/** Alerts all players and spectators in the game of the rating changes of the game. */
function sendRatingChangeToAllPlayers(servergame: ServerGame, ratingdata: RatingData): void {
	const messageContents = getRatingChangeMessageContents(ratingdata);
	broadcastToParticipants(servergame, 'gameratingchange', messageContents);
	broadcastToSpectators(servergame, 'gameratingchange', messageContents);
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

function getParticipantState(servergame: ServerGame, color: Player): ParticipantState {
	const opponentColor = typeutil.invertPlayer(color);
	const now = Date.now();
	const match = servergame.match;
	const opponentData = match.playerData[opponentColor]!;

	const participantState: ParticipantState = {
		drawOffer: {
			unconfirmed: doesColorHaveExtendedDrawOffer(match, opponentColor), // True if our opponent has extended a draw offer we haven't yet confirmed/denied
			lastOfferPly: getLastDrawOfferPlyOfColor(match, color), // The move ply WE HAVE last offered a draw, if we have, otherwise undefined.
		},
	};

	// Include other relevant stuff if defined...

	// If their opponent has disconnected and the claim window is set, send them that info too.
	if (opponentData.disconnect.timeOpponentMayClaim !== undefined) {
		participantState.disconnect = {
			millisUntilClaimable: opponentData.disconnect.timeOpponentMayClaim - now,
			wasByChoice: opponentData.disconnect.wasByChoice,
		};
	}

	// Once the game is over it lingers for the rematch handshake — send enough to
	// restore the rematch button's state (glow / disabled) on a page refresh.
	if (isGameOver(servergame)) {
		participantState.rematch = {
			offered: match.rematchOffers.has(opponentColor), // Opponent has an outstanding offer -> glow.
			present: opponentData.socket !== undefined, // Opponent connected -> button enabled.
		};
	}

	return participantState;
}

/**
 * Resolves the color a websocket is playing as in a specific live game, if they are a participant.
 * Uses game subscription metadata when valid, with identity fallback for resync/refresh cases.
 * @returns The player's color if the socket belongs to the game, otherwise undefined.
 */
function getSocketRoleInGame(servergame: ServerGame, ws: CustomWebSocket): Player | undefined {
	const match = servergame.match;
	if (match.id === ws.metadata.subscriptions.game?.id)
		return ws.metadata.subscriptions.game.color;
	// Color isn't provided in subscriptions (e.g. resync/refresh), resolve by identity.
	const identity = ws.metadata.memberInfo;
	for (const [splayer, data] of Object.entries(match.playerData)) {
		const playercolor = Number(splayer) as Player;
		if (memberInfoEq(identity, data.identifier)) return playercolor;
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
			'errLog',
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
	if (servergame.moves.length > 0) moves = servergame.moves.map((m) => m.token);
	const simplifiedGame = {
		id: `${servergame.match.id} (${uuid.base10ToBase62(servergame.match.id)})`,
		timeCreated: timeutil.timestampToISO(servergame.match.timeCreated),
		timeEnded:
			servergame.match.timeEnded !== undefined
				? timeutil.timestampToISO(servergame.match.timeEnded)
				: undefined,
		variant: servergame.match.variant,
		clock: servergame.match.clock,
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
 * Returns true if the provided color's opponent has been told they can claim
 * victory/draw against them (i.e. the claim-window timestamp is set, whether or
 * not it has elapsed yet). NOT whether the 5-second reconnection cushion has started.
 * @param match - The game they're in
 * @param color - The color they are in this game
 */
function isClaimWindowSetForColor(match: MatchInfo, color: Player): boolean {
	return match.playerData[color]!.disconnect.timeOpponentMayClaim !== undefined;
}

/**
 * Returns true if the provided color is currently disconnected — either still in the
 * reconnection cushion, or with their opponent's claim window set.
 * @param match - The game they're in
 * @param color - The color they are in this game
 */
function isColorDisconnected(match: MatchInfo, color: Player): boolean {
	const { startTime, timeOpponentMayClaim } = match.playerData[color]!.disconnect;
	return startTime !== undefined || timeOpponentMayClaim !== undefined;
}

/**
 * Sends the current clock values to the player who just moved.
 * @param servergame - The game
 */
function sendUpdatedClockToColor(servergame: ServerGame, color: Player): void {
	if (color !== p.BLACK && color !== p.WHITE) {
		logEventsAndPrint(
			`Color must be white or black when sending clock to color! Got: ${color}`,
			'errLog',
		);
		return;
	}
	if (servergame.untimed) return; // Don't send clock values in an untimed game

	const message = getGameClockValues(servergame);
	const playerSocket = servergame.match.playerData[color]!.socket;
	if (!playerSocket) return; // They are not connected, can't send message
	sendSocketMessage(playerSocket, 'game', 'clock', message);
}

/**
 * Return the clock values of the servergame that can be sent to a client or logged.
 * It also includes who's clock is currently counting down, if one is.
 * This also updates the clocks, as the players current time should not be the same as when their turn first started.
 */
function getGameClockValues(servergame: ServerGame & { untimed: false }): ClockValues {
	updateClockValues(servergame);
	return clock.createEdit(servergame.clocks);
}

/**
 * Update the games clock values. This is NOT called after the clocks are pushed,
 * This is called right before we send clock information to the client,
 *  so that it's as accurate as possible.
 * @param servergame - The game
 */
function updateClockValues(servergame: ServerGame & { untimed: false }): undefined {
	const now = Date.now();
	if (!isGameResignable(servergame) || isGameOver(servergame)) return;
	if (servergame.clocks.timeAtTurnStart === undefined)
		throw new Error('cannot update clock values when timeAtTurnStart is not defined!');

	const timeElapsedSinceTurnStart = now - servergame.clocks.timeAtTurnStart;
	const newTime = servergame.clocks.timeRemainAtTurnStart! - timeElapsedSinceTurnStart;
	const playerdata = servergame.clocks.currentTime;
	if (playerdata[servergame.whosTurn] === undefined) {
		logEventsAndPrint(
			`Cannot update games clock values when whose turn doesn't have a clock! "${servergame.whosTurn}"`,
			'errLog',
		);
		return;
	}
	playerdata[servergame.whosTurn] = newTime;
	return;
}

/**
 * Sends a move to the player provided
 * @param servergame - The game
 * @param color - The color of the player to send the latest move to
 * @param message - The move message to send (from {@link buildMoveMessage})
 */
function sendMoveToColor(
	servergame: ServerGame,
	color: Player,
	message: OpponentsMoveMessage,
): void {
	const match = servergame.match;
	if (!(color in match.playerData)) {
		logEventsAndPrint(
			`Color to send move to must be one that is in the game (white or black)! ${color}`,
			'errLog',
		);
		return;
	}

	const sendToWS = match.playerData[color]!.socket;
	if (!sendToWS) return; // They are not connected, can't send message

	sendSocketMessage(sendToWS, 'game', 'move', message);
}

/**
 * Builds the role-agnostic {@link OpponentsMoveMessage} for
 * the latest move, sent to both player and spectator sends.
 */
function buildMoveMessage(servergame: ServerGame, move: MoveRecord): OpponentsMoveMessage {
	const message: OpponentsMoveMessage = {
		move: simplifyMove(move),
		gameConclusion: servergame.gameConclusion,
		moveNumber: servergame.moves.length,
	};
	if (!servergame.untimed) message.clockValues = getGameClockValues(servergame);
	return message;
}

/** Broadcasts a game-route message to every connected participant of the game. */
function broadcastToParticipants(servergame: ServerGame, action: string, value: any): void {
	for (const data of Object.values(servergame.match.playerData)) {
		if (data.socket === undefined) continue; // Not connected, can't send message
		sendSocketMessage(data.socket, 'game', action, value);
	}
}

/** Broadcasts a role-agnostic game-route message to every spectator of the game. */
function broadcastToSpectators(servergame: ServerGame, action: string, value: any): void {
	for (const ws of servergame.spectators) {
		sendSocketMessage(ws, 'game', action, value);
	}
}

/**
 * Simplifies a game's move into the {@link MovePacket} sent over the wire: its
 * serialized token plus its clockStamp (the clock at that move, for rewind display).
 */
function simplifyMove(move: MoveRecord): MovePacket {
	const packet: MovePacket = { token: move.token };
	if (move.clockStamp !== undefined) packet.clockStamp = move.clockStamp;
	return packet;
}

/**
 * Cancel the timer that finalizes a concluded game, if it is currently running.
 */
function cancelFinalizeTimer(match: MatchInfo): void {
	clearTimeout(match.finalizeTimeoutID);
}

/**
 * Tests if the game is resignable (at least 2 moves have been played).
 * If not, then the game is abortable.
 * @param basegame - The game
 * @returns *true* if the game is resignable.
 */
function isGameResignable(servergame: ServerGame): boolean {
	return servergame.moves.length > 1;
}

/**
 * Tests if the game has just become resignable with the latest move (exactly 2 moves have been played).
 * @param servergame - The game
 * @returns *true* if the game has just become resignable after the last move.
 */
function isGameBorderlineResignable(servergame: ServerGame): boolean {
	return servergame.moves.length === 2;
}

/**
 * Returns the color of the player that played that moveIndex within the moves list.
 * Returns error if index -1
 */
function getColorThatPlayedMoveIndex(servergame: ServerGame, i: number): Player {
	const turnOrder = servergame.gameRules.turnOrder;
	if (i === -1) return turnOrder[turnOrder.length - 1]!;

	return turnOrder[i % turnOrder.length]!;
}

export type { ServerGame, MatchInfo, PlayerData, PlayerDisconnect, GameSetup };

export default {
	initMatch,
	initServerGame,
	subscribeClientToGame,
	unsubClientFromGame,
	resyncToGame,
	sendParticipantGameState,
	assignWhiteBlackPlayersFromSeek,
	buildStaticGameState,
	produceFullGameState,
	buildMetadataOfGame,
	broadcastParticipantGameUpdate,
	sendGameUpdateToColor,
	sendRatingChangeToAllPlayers,
	getSocketRoleInGame,
	sendMessageToSocketOfColor,
	printGame,
	getSimplifiedGameString,
	isGameOver,
	isClaimWindowSetForColor,
	isColorDisconnected,
	getGameClockValues,
	sendUpdatedClockToColor,
	sendMoveToColor,
	buildMoveMessage,
	broadcastToSpectators,
	cancelFinalizeTimer,
	isGameResignable,
	isGameBorderlineResignable,
	getColorThatPlayedMoveIndex,
};
