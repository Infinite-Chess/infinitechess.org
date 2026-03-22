// src/shared/types.ts

/**
 * Miscellaneous shared type definitions and schemas between server and client.
 *
 * Centralized here to avoid circular dependency issues.
 */

import * as z from 'zod';

import typeutil from './chess/util/typeutil.js';
import winconutil from './chess/util/winconutil.js';

// Common Helper Schemas ---------------------------------------------------------------

/** A player's rating value and whether we are confident about it. */
export type Rating = z.infer<typeof RatingSchema>;
export const RatingSchema = z.strictObject({
	value: z.number(),
	confident: z.boolean(),
});

/**
 * The clock value for the game, `s+s`, where the left side is
 * start time in seconds, and the right is increment in seconds.
 * Untimed = `-`
 */
export type TimeControl = z.infer<typeof TimeControlSchema>;
export const TimeControlSchema = z.union([
	z.templateLiteral([z.number(), '+', z.number()]),
	z.literal('-'),
]);

// Invite Helper Schemas ---------------------------------------------------------------

/** The username container of an invite sent by the server. DIFFERENT FROM UsernameContainerProperties!!!! */
export type ServerUsernameContainer = z.infer<typeof ServerUsernameContainerSchema>;
export const ServerUsernameContainerSchema = z.strictObject({
	type: z.enum(['player', 'guest']),
	username: z.string(),
	/** The rating of the user. Falls back to the INFINITY leaderboard. */
	rating: RatingSchema.optional(),
});

// Game Helper Schemas ---------------------------------------------------------------

/** The values of each color's clock, and which one is currently counting down, if any. */
export type ClockValues = z.infer<typeof ClockValuesSchema>;
export const ClockValuesSchema = z.strictObject({
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
export const MovePacketSchema = z.strictObject({
	token: z.string(),
	clockStamp: z.number().optional(),
});

/** Info storing draw offers of the game. */
export type DrawOfferInfo = z.infer<typeof DrawOfferInfoSchema>;
export const DrawOfferInfoSchema = z.strictObject({
	/** True if our opponent has extended a draw offer we haven't yet confirmed/denied. */
	unconfirmed: z.boolean(),
	/** The move ply WE HAVE last offered a draw, if we have, otherwise undefined. */
	lastOfferPly: z.number().int().optional(),
});

/** Contains information about an opponent's disconnection. */
export const DisconnectInfoSchema = z.strictObject({
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
export const ParticipantStateSchema = z.strictObject({
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
export const GameUpdateMessageSchema = z.strictObject({
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
export const OpponentsMoveMessageSchema = z.strictObject({
	/** The move our opponent played. In the most compact notation: `"5,2>5,4"`. */
	move: MovePacketSchema,
	gameConclusion: winconutil.gameConclusionSchema.optional(),
	/** Our opponent's move number, 1-based. */
	moveNumber: z.number().int().positive(),
	/** If the game is timed, this will be the current clock values. */
	clockValues: ClockValuesSchema.optional(),
});

/** ICN (Infinite Chess Notation) metadata for a game, inspired by PGN notation. */
export type MetaData = z.infer<typeof MetaDataSchema>;
export const MetaDataSchema = z.strictObject({
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

/** A single player's rating change from a completed rated game. */
export type PlayerRatingChangeInfo = z.infer<typeof PlayerRatingChangeInfoSchema>;
export const PlayerRatingChangeInfoSchema = z.strictObject({
	newRating: RatingSchema,
	change: z.number(),
});
