// src/client/scripts/esm/websocket/socketschemas.ts

/**
 * This script defines all Zod schemas for validating incoming server websocket messages.
 *
 * All schemas are centralized here to avoid circular dependency issues.
 *
 * Schemas are organized by route: general, lobby, game, and a master schema
 * that combines them all together with echo and reply-only message handling.
 */

import * as z from 'zod';

import typeschemas from '../../../../shared/chess/util/typeschemas.js';
import {
	ClockValuesSchema,
	DisconnectInfoSchema,
	GameUpdateMessageSchema,
	MetaDataSchema,
	OpponentsMoveMessageSchema,
	OutSeekSchema,
	PlayerRatingChangeInfoSchema,
	RatingSchema,
} from '../../../../shared/types.js';

// Invite Helper Schemas ---------------------------------------------------------------

// Game Helper Schemas ---------------------------------------------------------------

/** Zod schema for the id of an online game. */
const GameIDSchema = z.number().int().nonnegative();

/**
 * Static information about an online game that is unchanging.
 * Only needed once, when we originally load the game, not on subsequent updates/resyncs.
 */
export type ServerGameInfo = z.infer<typeof ServerGameInfoSchema>;
const ServerGameInfoSchema = z.strictObject({
	/** The id of the online game. */
	id: GameIDSchema,
	rated: z.boolean(),
	playerRatings: typeschemas.GenPlayerGroupSchema(RatingSchema),
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
	youAreColor: typeschemas.PlayerSchema,
});

// General Schema ---------------------------------------------------------------

/** Represents all possible types an incoming 'general' route websocket message contents could be. */
export type GeneralMessage = z.infer<typeof GeneralSchema>;
const GeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('notify'), value: z.string() }),
	z.strictObject({ action: z.literal('notifyerror'), value: z.string() }),
	z.strictObject({ action: z.literal('print'), value: z.string() }),
	z.strictObject({ action: z.literal('printerror'), value: z.string() }),
	z.strictObject({ action: z.literal('ping') }),
	z.strictObject({ action: z.literal('gameversion'), value: z.string() }),
]);

// Invites Schema ---------------------------------------------------------------

/** Represents all possible types an incoming 'lobby' route websocket message contents could be. */
export type LobbyMessage = z.infer<typeof LobbySchema>;
const LobbySchema = z.discriminatedUnion('action', [
	z.strictObject({
		action: z.literal('seekslist'),
		value: z.strictObject({
			invitesList: z.array(OutSeekSchema),
			viewerCount: z.number().nonnegative(),
		}),
	}),
	z.strictObject({ action: z.literal('viewercount'), value: z.number().nonnegative() }),
]);

// Game Schema ---------------------------------------------------------------

/** All possible types an incoming 'game' route websocket message contents could be. */
export type GameMessage = z.infer<typeof GameSchema>;
const GameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('joingame'), value: JoinGameMessageSchema }),
	z.strictObject({
		action: z.literal('logged-game-info'),
		value: z.strictObject({
			game_id: GameIDSchema,
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
		route: z.literal('lobby'),
		contents: LobbySchema,
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
