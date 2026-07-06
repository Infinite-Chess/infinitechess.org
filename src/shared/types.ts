// src/shared/types.ts

/**
 * Miscellaneous shared type definitions and schemas between server and client.
 *
 * Centralized here to avoid circular dependency issues.
 */

import * as z from 'zod';

import winconutil from './chess/util/winconutil.js';
import editorutil from './util/editorutil.js';
import gameconfig from './util/gameconfig.js';
import typeschemas from './chess/util/typeschemas.js';
import variantregistry from './chess/variants/variantregistry.js';
import { POSITION_STRING_THRESHOLD } from './chess/variants/servervalidation.js';

import './chess/util/typeutil.js';

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
	z.templateLiteral([z.int().positive(), '+', z.int().nonnegative()]),
	z.literal('-'),
]);

// Seek Helper Schemas ---------------------------------------------------------------

/** Whether a game is casual or rated. */
export type GameMode = z.infer<typeof GameModeSchema>;
export const GameModeSchema = z.enum(['casual', 'rated']);

/** The username container of an seek sent by the server. DIFFERENT FROM UsernameContainerProperties!!!! */
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
	clocks: typeschemas.GenPlayerGroupSchema(z.number()),
	/**
	 * If a player's timer is currently counting down, this should be specified.
	 * No clock is ticking if less than 2 moves are played, or if the game is over.
	 * The color specified should have their time immediately accommodated for ping.
	 */
	colorTicking: typeschemas.PlayerSchema.optional(),
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
export type DisconnectInfo = z.infer<typeof DisconnectInfoSchema>;
export const DisconnectInfoSchema = z.strictObject({
	/**
	 * How many milliseconds remain, at the time the server sent the message, until we
	 * may claim victory / a draw against our disconnected opponent. The client counts
	 * down from this.
	 */
	millisUntilClaimable: z.number(),
	/** Whether the opponent disconnected by choice, or if it was non-intentional (lost network). */
	voluntary: z.boolean(),
});

/** The state of a post-game rematch offer, from the perspective of one participant. */
export type RematchOfferInfo = z.infer<typeof RematchOfferInfoSchema>;
export const RematchOfferInfoSchema = z.strictObject({
	/** True if our opponent has an outstanding rematch offer (drives the button's glow). */
	offered: z.boolean(),
	/** True if our opponent is currently connected (otherwise the rematch button is disabled). */
	present: z.boolean(),
});

/** The state of the game unique to participants (not spectators): draw/disconnect while live, and rematch once over. */
export type ParticipantState = z.infer<typeof ParticipantStateSchema>;
export const ParticipantStateSchema = z.strictObject({
	drawOffer: DrawOfferInfoSchema,
	/** If our opponent has disconnected, this will be present. */
	disconnect: DisconnectInfoSchema.optional(),
	/** Present only once the game is concluded and not memory-evicted yet for the rematch handshake. */
	rematch: RematchOfferInfoSchema.optional(),
});

/**
 * The recipient-agnostic core of a live game-state message (no per-player overlay). Carries the
 * live move list, clocks, conclusion, and finalized flag. The core of every `gamestate` message —
 * the `subscribe` reply (fresh load or live reconnect).
 */
export type GameStateBase = z.infer<typeof GameStateBaseSchema>;
export const GameStateBaseSchema = z.strictObject({
	/** The full move list (reconciled against on reconnect). */
	moves: z.array(MovePacketSchema),
	/** The live ticking clocks. Absent for untimed games. */
	clockValues: ClockValuesSchema.optional(),
	gameConclusion: winconutil.gameConclusionSchema.optional(),
	/**
	 * Whether the game is finalized (result locked in permanently). Once true, nothing but rematch
	 * offers can change, so the client reconnects with `subscriberematch` instead of a full `subscribe`.
	 */
	finalized: z.boolean(),
	/**
	 * When true, the client must force its move list to exactly match the server's — reverting any
	 * extra unconfirmed move at the end rather than re-submitting it. Set only when the server
	 * rejected the client's last move; absent (⇒ false) on a normal subscribe / live reconnect.
	 */
	forceSync: z.boolean().optional(),
});

/**
 * A live game-state message: the {@link GameStateBase} plus the recipient's participant overlay.
 * The payload of every `gamestate` message — the `subscribe` reply.
 * `participantState` is present for participants of an ongoing game, absent for spectators.
 */
export type GameStateMessage = z.infer<typeof GameStateMessageSchema>;
export const GameStateMessageSchema = GameStateBaseSchema.extend({
	participantState: ParticipantStateSchema.optional(),
});

/**
 * Server websocket `'gameconclusion'` message — a non-move-triggered conclusion for spectators.
 * Spectators can't desync so long as their socket is open, so they need only the conclusion
 * + frozen clocks, not a full re-send. (Move-triggered conclusions reach them via `'move'`.)
 */
export type GameConclusionMessage = z.infer<typeof GameConclusionMessageSchema>;
export const GameConclusionMessageSchema = z.strictObject({
	gameConclusion: winconutil.gameConclusionSchema,
	/** If the game is timed, the frozen final clock values. */
	clockValues: ClockValuesSchema.optional(),
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

// Game State Schemas ---------------------------------------------------------------

/** A game's variant: a preset `code`, or a `custom` game (position sourced from the ICN / live state). */
export type GameStateVariant = z.infer<typeof GameStateVariantSchema>;
export const GameStateVariantSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('preset'), code: z.enum(variantregistry.VARIANT_CODES) }),
	z.strictObject({ kind: z.literal('custom') }),
]);

/**
 * The static setup of a game: how it was configured at creation — variant, clock settings, and
 * creation time. Unchanging for the game's whole life. SSR'd into `gamePageData` (and embedded in
 * {@link StaticGameState} for the side bar / dead-game HTTP), so it is never sent over the subscribe
 * socket — the client already has it by game-load time.
 */
export type StaticGameSetup = z.infer<typeof StaticGameSetupSchema>;
export const StaticGameSetupSchema = z.strictObject({
	variant: GameStateVariantSchema,
	timeControl: TimeControlSchema,
	/** Epoch milliseconds the game was created. */
	timeCreated: z.number(),
});

/**
 * A game's {@link StaticGameSetup} plus its identity + display fields (id, rated, players) and current
 * conclusion. Used by the SSR side bar and the dead-game HTTP path. Everything here is static &
 * unchanging since the game's inception EXCEPT the gameConclusion.
 */
export type StaticGameState = z.infer<typeof StaticGameStateSchema>;
export const StaticGameStateSchema = StaticGameSetupSchema.extend({
	id: z.int().nonnegative(),
	rated: z.boolean(),
	/** Per-color username container, with rating embedded per player. */
	players: typeschemas.GenPlayerGroupSchema(ServerUsernameContainerSchema),
	gameConclusion: winconutil.gameConclusionSchema.optional(),
});

/**
 * The full state of a DEAD (concluded) game, served over HTTP (`GET /api/game/:id`).
 * Built from DB columns only — the server does not parse the ICN.
 */
export type DeadGameState = z.infer<typeof DeadGameStateSchema>;
export const DeadGameStateSchema = StaticGameStateSchema.extend({
	/**
	 * Source of truth for moves + clock stamps (+ start position
	 * only for custom-position games); the client parses it.
	 */
	icn: z.string(),
	/** Per signed-in player rating change. Rated games only; omitted otherwise. */
	ratingChanges: typeschemas.GenPlayerGroupSchema(PlayerRatingChangeInfoSchema).optional(),
	/** Ms remaining per color at game end. Timed games only; a guest color may be absent. */
	finalClocks: typeschemas.GenPlayerGroupSchema(z.number()).optional(),
});

// Seek Helper Schemas ---------------------------------------------------------------

/**
 * The variant kinds that a fully-resolved seek can have.
 * CloudSave seeks are converted to 'custom' at creation time and never stored as 'cloudSave'.
 */
export type AuthSeekVariant = z.infer<typeof AuthSeekVariantSchema>;
export const AuthSeekVariantSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('preset'), code: z.enum(variantregistry.VARIANT_CODES) }),
	z.strictObject({
		kind: z.literal('custom'),
		position: z.string().min(1).max(POSITION_STRING_THRESHOLD),
	}),
]);

/** The full variant selection as sent by the client when creating a seek. */
export type SeekVariant = z.infer<typeof SeekVariantSchema>;
export const SeekVariantSchema = z.discriminatedUnion('kind', [
	...AuthSeekVariantSchema.options,
	z.strictObject({
		kind: z.literal('cloudSave'),
		name: z.string().min(1).max(editorutil.MAX_POSITION_NAME_LENGTH),
	}),
]);

/**
 * The variant as broadcast to lobby viewers. ICN seeks omit the content so the
 * full ICN text is not sent to every connected client.
 */
export type OutSeekVariant = z.infer<typeof OutSeekVariantSchema>;
export const OutSeekVariantSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('preset'), code: z.enum(variantregistry.VARIANT_CODES) }),
	z.strictObject({ kind: z.literal('custom') }),
]);

/** The full configuration for a single game modifier applied to a seek. */
export type SeekModifier = z.infer<typeof SeekModifierSchema>;
export const SeekModifierSchema = z.discriminatedUnion('kind', [
	z.strictObject({
		kind: z.literal('slide-limit'),
		value: z.literal(gameconfig.SLIDE_LIMIT_VALUES),
	}),
]);

/** The number of digits generated seek IDs are. */
export const IDLengthOfSeeks = 5;
/** Seek ID: Base36 alphanumeric, fixed length of 5. */
export const SeekIdSchema = z
	.string()
	.length(IDLengthOfSeeks)
	.regex(/^[0-9a-z]+$/);

/** Shared info for all lobby game seek types. (excludes variant) */
export type BaseSeek = z.infer<typeof BaseSeekSchema>;
export const BaseSeekSchema = z.strictObject({
	id: SeekIdSchema,
	tag: z.string(),
	player: ServerUsernameContainerSchema,
	color: z.union([typeschemas.PlayerSchema, z.literal(null)]),
	time: TimeControlSchema,
	mode: GameModeSchema,
	modifiers: z.array(SeekModifierSchema).optional(),
});

/** The version of seeks broadcast to lobby viewers. */
export type OutSeek = z.infer<typeof OutSeekSchema>;
export const OutSeekSchema = BaseSeekSchema.extend({
	variant: OutSeekVariantSchema,
});
