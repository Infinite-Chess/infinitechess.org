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
import {
	ClockValuesSchema,
	DisconnectInfoSchema,
	GameUpdateMessageSchema,
	MetaDataSchema,
	OpponentsMoveMessageSchema,
	PlayerRatingChangeInfoSchema,
	RatingSchema,
	ServerUsernameContainerSchema,
	TimeControlSchema,
} from '../../../../../shared/types.js';

// Common Helper Schemas ---------------------------------------------------------------

/** The publicity of a game/invite. */
const PublicitySchema = z.enum(['public', 'private']);

// Invite Helper Schemas ---------------------------------------------------------------

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
	publicity: PublicitySchema,
	playerRatings: typeutil.GenPlayerGroupSchema(RatingSchema),
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
