// src/client/scripts/esm/game/websocket/socketschemas.ts

/**
 * This script defines all Zod schemas for validating incoming server websocket messages.
 *
 * All schemas are centralized here to avoid circular dependency issues.
 *
 * Schemas are organized by route: general, invites, game, and a master schema
 * that combines them all together with echo and reply-only message handling.
 */

import * as z from 'zod';

import typeutil from '../../../../../shared/chess/util/typeutil.js';
import winconutil from '../../../../../shared/chess/util/winconutil.js';

// Common Helper Schemas ---------------------------------------------------------------

/** A player's rating value and whether we are confident about it. */
export type Rating = z.infer<typeof RatingSchema>;
const RatingSchema = z.strictObject({
	value: z.number(),
	confident: z.boolean(),
});

/** The publicity of a game/invite. */
const PublicitySchema = z.enum(['public', 'private']);

/**
 * The clock value for the game, `s+s`, where the left side is
 * start time in seconds, and the right is increment in seconds.
 * Untimed = `-`
 */
export type TimeControl = z.infer<typeof TimeControlSchema>;
const TimeControlSchema = z.union([
	z.templateLiteral([z.number(), '+', z.number()]),
	z.literal('-'),
]);

// Invite Helper Schemas ---------------------------------------------------------------

/** The username container of an invite sent by the server. DIFFERENT FROM UsernameContainerProperties!!!! */
export type ServerUsernameContainer = z.infer<typeof ServerUsernameContainerSchema>;
const ServerUsernameContainerSchema = z.strictObject({
	type: z.enum(['player', 'guest']),
	username: z.string(),
	/** The rating of the user. Falls back to the INFINITY leaderboard. */
	rating: RatingSchema.optional(),
});

/** The invite object. NOT an HTML object. */
export type Invite = z.infer<typeof InviteSchema>;
const InviteSchema = z.strictObject({
	/** Who owns the invite. */
	usernamecontainer: ServerUsernameContainerSchema,
	/** A unique identifier. */
	id: z.string(),
	/** Used to verify if an invite is your own. */
	tag: z.string().optional(),
	/** The name of the variant. */
	variant: z.string(),
	/** The clock value. */
	clock: TimeControlSchema,
	/** The player color (null = Random). */
	color: z.union([typeutil.PlayerSchema, z.literal(null)]),
	/** Whether the game is public or private. */
	publicity: PublicitySchema,
	/** Whether the game is rated or casual. */
	rated: z.enum(['casual', 'rated']),
});

// Game Helper Schemas ---------------------------------------------------------------

/** The values of each color's clock, and which one is currently counting down, if any. */
export type ClockValues = z.infer<typeof ClockValuesSchema>;
const ClockValuesSchema = z.strictObject({
	/** Each color's remaining time in milliseconds, keyed by player number. */
	clocks: typeutil.GenPlayerGroupSchema(z.number()),
	/**
	 * If a player's timer is currently counting down, this should be specified.
	 * No clock is ticking if less than 2 moves are played, or if the game is over.
	 * The color specified should have their time immediately accommodated for ping.
	 */
	colorTicking: typeutil.PlayerSchema.optional(),
	/**
	 * The timestamp the color ticking (if there is one) will lose by timeout.
	 * This should be calculated AFTER we adjust the clock values for ping.
	 * The server should NOT specify this when sending the clock information
	 * to the client, because the server and client's clocks are not always in sync.
	 */
	timeColorTickingLosesAt: z.number().optional(),
});

/** A move as transmitted over the wire: the serialized move token (e.g. `"1,2>3,4=N"`) and an optional clock stamp. */
export type MovePacket = z.infer<typeof MovePacketSchema>;
const MovePacketSchema = z.strictObject({
	token: z.string(),
	clockStamp: z.number().optional(),
});

/** Info storing draw offers of the game. */
export type DrawOfferInfo = z.infer<typeof DrawOfferInfoSchema>;
const DrawOfferInfoSchema = z.strictObject({
	/** True if our opponent has extended a draw offer we haven't yet confirmed/denied. */
	unconfirmed: z.boolean(),
	/** The move ply WE HAVE last offered a draw, if we have, otherwise undefined. */
	lastOfferPly: z.number().int().optional(),
});

/** Contains information about an opponent's disconnection. */
const DisconnectInfoSchema = z.strictObject({
	/**
	 * How many milliseconds left until our opponent will be auto-resigned from disconnection,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoDisconnectResign: z.number(),
	/** Whether the opponent disconnected by choice, or if it was non-intentional (lost network). */
	wasByChoice: z.boolean(),
});

/** The state of the game unique to participants, while the game is ongoing — not for spectators, and not when the game is over. */
export type ParticipantState = z.infer<typeof ParticipantStateSchema>;
const ParticipantStateSchema = z.strictObject({
	drawOffer: DrawOfferInfoSchema,
	/** If our opponent has disconnected, this will be present. */
	disconnect: DisconnectInfoSchema.optional(),
	/**
	 * If our opponent is AFK, this is how many milliseconds left until they will be auto-resigned,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoAFKResign: z.number().optional(),
});

/** The message contents of a server websocket `'gameupdate'` message. */
export type GameUpdateMessage = z.infer<typeof GameUpdateMessageSchema>;
const GameUpdateMessageSchema = z.strictObject({
	gameConclusion: winconutil.gameConclusionSchema.optional(),
	/** Existing moves, if any, to forward to the front of the game. */
	moves: z.array(MovePacketSchema),
	participantState: ParticipantStateSchema,
	clockValues: ClockValuesSchema.optional(),
	/**
	 * When true, the client's resync logic should force its move list to exactly match
	 * the server's, even if the client has one extra move at the end that is "ours".
	 * The client must revert it rather than re-submitting it.
	 */
	forceSync: z.boolean(),
});

/** The message contents of a server websocket `'move'` message — our opponent's move. */
export type OpponentsMoveMessage = z.infer<typeof OpponentsMoveMessageSchema>;
const OpponentsMoveMessageSchema = z.strictObject({
	/** The move our opponent played. In the most compact notation: `"5,2>5,4"`. */
	move: MovePacketSchema,
	gameConclusion: winconutil.gameConclusionSchema.optional(),
	/** Our opponent's move number, 1-based. */
	moveNumber: z.number().int().positive(),
	/** If the game is timed, this will be the current clock values. */
	clockValues: ClockValuesSchema.optional(),
});

/**
 * Static information about an online game that is unchanging.
 * Only needed once, when we originally load the game, not on subsequent updates/resyncs.
 */
export type ServerGameInfo = z.infer<typeof ServerGameInfoSchema>;
const ServerGameInfoSchema = z.strictObject({
	/** The id of the online game. */
	id: z.number().int().nonnegative(),
	rated: z.boolean(),
	publicity: PublicitySchema,
	playerRatings: typeutil.GenPlayerGroupSchema(RatingSchema),
});

/** ICN (Infinite Chess Notation) metadata for a game, inspired by PGN notation. */
export type MetaData = z.infer<typeof MetaDataSchema>;
const MetaDataSchema = z.strictObject({
	/** What kind of game (rated/casual), and variant, in spoken language. E.g. "Casual local Classical infinite chess game". */
	Event: z.string().optional(),
	/** What website the game was played on. */
	Site: z.literal('https://www.infinitechess.org/').optional(),
	TimeControl: TimeControlSchema.optional(),
	/** The round number. A pgn-required metadata with no current application to infinitechess.org. */
	Round: z.literal('-').optional(),
	/** The UTC date of the game, in the format `"YYYY.MM.DD"`. */
	UTCDate: z.string().optional(),
	/** The UTC time the game started, in the format `"HH:MM:SS"`. */
	UTCTime: z.string().optional(),
	/** If it's not a custom position, this must be one of the valid variants. */
	Variant: z.string().optional(),
	White: z.string().optional(),
	Black: z.string().optional(),
	/** The ID of the white player, if they are signed in, converted to base 62. */
	WhiteID: z.string().optional(),
	/** The ID of the black player, if they are signed in, converted to base 62. */
	BlackID: z.string().optional(),
	/** The display elo of the white player, which may include a "?" if we're uncertain about their rating. */
	WhiteElo: z.string().optional(),
	/** The display elo of the black player, which may include a "?" if we're uncertain about their rating. */
	BlackElo: z.string().optional(),
	/** How much elo white gained/lost from the match. */
	WhiteRatingDiff: z.string().optional(),
	/** How much elo black gained/lost from the match. */
	BlackRatingDiff: z.string().optional(),
	/** How many points each side received from the game (e.g. `"1-0"` means white won, `"1/2-1/2"` means a draw). */
	Result: z.string().optional(),
	/** What caused the game to end, in spoken language. E.g. "Time forfeit". */
	Termination: z.string().optional(),
});

/**
 * The message contents when we receive a server websocket `'joingame'` message.
 * Contains everything a {@link GameUpdateMessage} would have, and more!
 *
 * The extra stuff included here does not need to be specified when we're resyncing to
 * a game, or receiving a game update, as we already know it.
 */
export type JoinGameMessage = z.infer<typeof JoinGameMessageSchema>;
const JoinGameMessageSchema = GameUpdateMessageSchema.extend({
	gameInfo: ServerGameInfoSchema,
	/** The metadata of the game, including the TimeControl, player names, date, etc. */
	metadata: MetaDataSchema,
	youAreColor: typeutil.PlayerSchema,
});

/** A single player's rating change from a completed rated game. */
export type PlayerRatingChangeInfo = z.infer<typeof PlayerRatingChangeInfoSchema>;
const PlayerRatingChangeInfoSchema = z.strictObject({
	newRating: RatingSchema,
	change: z.number(),
});

// General Schema ---------------------------------------------------------------

/** Represents all possible types an incoming 'general' route websocket message contents could be. */
export type GeneralMessage = z.infer<typeof GeneralSchema>;
const GeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('notify'), value: z.string() }),
	z.strictObject({ action: z.literal('notifyerror'), value: z.string() }),
	z.strictObject({ action: z.literal('print'), value: z.string() }),
	z.strictObject({ action: z.literal('printerror'), value: z.string() }),
	z.strictObject({ action: z.literal('renewconnection') }),
	z.strictObject({ action: z.literal('gameversion'), value: z.string() }),
]);

// Invites Schema ---------------------------------------------------------------

/** Represents all possible types an incoming 'invites' route websocket message contents could be. */
export type InvitesMessage = z.infer<typeof InvitesSchema>;
const InvitesSchema = z.discriminatedUnion('action', [
	z.strictObject({
		action: z.literal('inviteslist'),
		value: z.strictObject({ invitesList: z.array(InviteSchema), currentGameCount: z.number() }),
	}),
	z.strictObject({ action: z.literal('gamecount'), value: z.number() }),
]);

// Game Schema ---------------------------------------------------------------

/** All possible types an incoming 'game' route websocket message contents could be. */
export type GameMessage = z.infer<typeof GameSchema>;
const GameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('joingame'), value: JoinGameMessageSchema }),
	z.strictObject({
		action: z.literal('logged-game-info'),
		value: z.strictObject({
			game_id: z.number().int().nonnegative(),
			rated: z.literal([0, 1]),
			private: z.literal([0, 1]),
			termination: z.string(),
			icn: z.string(),
		}),
	}),
	z.strictObject({ action: z.literal('move'), value: OpponentsMoveMessageSchema }),
	z.strictObject({ action: z.literal('clock'), value: ClockValuesSchema }),
	z.strictObject({
		action: z.literal('gameupdate'),
		value: GameUpdateMessageSchema,
	}),
	z.strictObject({
		action: z.literal('gameratingchange'),
		value: z.record(z.string(), PlayerRatingChangeInfoSchema),
	}),
	z.strictObject({ action: z.literal('unsub') }),
	z.strictObject({ action: z.literal('login') }),
	z.strictObject({ action: z.literal('nogame') }),
	z.strictObject({ action: z.literal('leavegame') }),
	z.strictObject({
		action: z.literal('opponentafk'),
		value: z.strictObject({ millisUntilAutoAFKResign: z.number() }),
	}),
	z.strictObject({ action: z.literal('opponentafkreturn') }),
	z.strictObject({
		action: z.literal('opponentdisconnect'),
		value: DisconnectInfoSchema,
	}),
	z.strictObject({ action: z.literal('opponentdisconnectreturn') }),
	z.strictObject({ action: z.literal('drawoffer') }),
	z.strictObject({ action: z.literal('declinedraw') }),
]);

// Master Schema ---------------------------------------------------------------

/** The schema for validating all incoming websocket messages. */
const MasterSchema = z.discriminatedUnion('route', [
	// Echo messages
	z.strictObject({
		route: z.literal('echo'),
		contents: z.number(),
	}),
	// Reply-only messages (no route property, only exist to execute on-reply functions)
	z.strictObject({
		id: z.number(),
		route: z.undefined(),
		replyto: z.number(),
	}),
	// Routed messages
	z.strictObject({
		id: z.number(),
		route: z.literal('general'),
		contents: GeneralSchema,
		replyto: z.number().optional(),
	}),
	z.strictObject({
		id: z.number(),
		route: z.literal('invites'),
		contents: InvitesSchema,
		replyto: z.number().optional(),
	}),
	z.strictObject({
		id: z.number(),
		route: z.literal('game'),
		contents: GameSchema,
		replyto: z.number().optional(),
	}),
]);

// Exports ---------------------------------------------------------------

export { MasterSchema };
