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

/** Zod schema for a player rating. */
const RatingSchema = z.strictObject({
	value: z.number(),
	confident: z.boolean(),
});

/** Zod schema for the publicity of a game/invite. */
const PublicitySchema = z.enum(['public', 'private']);

const TimeControlSchema = z.union([
	z.templateLiteral([z.number(), '+', z.number()]),
	z.literal('-'),
]);

// Invite Helper Schemas ---------------------------------------------------------------

/** Zod schema for a server-side username container included in invite objects. */
const ServerUsernameContainerSchema = z.strictObject({
	type: z.enum(['player', 'guest']),
	username: z.string(),
	rating: RatingSchema.optional(),
});

/** Zod schema for a single invite object. */
const InviteSchema = z.strictObject({
	usernamecontainer: ServerUsernameContainerSchema,
	id: z.string(),
	tag: z.string().optional(),
	variant: z.string(),
	clock: z.union([z.templateLiteral([z.number(), '+', z.number()]), z.literal('-')]),
	color: z.union([typeutil.PlayerSchema, z.literal(null)]),
	publicity: PublicitySchema,
	rated: z.enum(['casual', 'rated']),
});

// Game Helper Schemas ---------------------------------------------------------------

/** Zod schema for a game's clock values. */
const ClockValuesSchema = z.strictObject({
	/** Each color's remaining time in milliseconds, keyed by player number. */
	clocks: typeutil.GenPlayerGroupSchema(z.number()),
	colorTicking: typeutil.PlayerSchema.optional(),
	timeColorTickingLosesAt: z.number().optional(),
});

/** Zod schema for a single move as transmitted over the wire. */
const MovePacketSchema = z.strictObject({
	token: z.string(),
	clockStamp: z.number().optional(),
});

/** Zod schema for a participant's draw-offer state. */
const DrawOfferInfoSchema = z.strictObject({
	unconfirmed: z.boolean(),
	lastOfferPly: z.number().int().optional(),
});

/** Zod schema for a participant's disconnect state. */
const DisconnectInfoSchema = z.strictObject({
	millisUntilAutoDisconnectResign: z.number(),
	wasByChoice: z.boolean(),
});

/** Zod schema for a game's participant. */
const ParticipantStateSchema = z.strictObject({
	drawOffer: DrawOfferInfoSchema,
	disconnect: DisconnectInfoSchema.optional(),
	millisUntilAutoAFKResign: z.number().optional(),
});

/** Zod schema for a 'gameupdate' message. */
const GameUpdateMessageSchema = z.strictObject({
	gameConclusion: winconutil.gameConclusionSchema.optional(),
	moves: z.array(MovePacketSchema),
	participantState: ParticipantStateSchema,
	clockValues: ClockValuesSchema.optional(),
	forceSync: z.boolean(),
});

/** Zod schema for an 'opponents move' message value. */
const OpponentsMoveMessageSchema = z.strictObject({
	move: MovePacketSchema,
	gameConclusion: winconutil.gameConclusionSchema.optional(),
	moveNumber: z.number().int().positive(),
	clockValues: ClockValuesSchema.optional(),
});

/** Zod schema for static info about a server-side online game. */
const ServerGameInfoSchema = z.strictObject({
	id: z.number().int().nonnegative(),
	rated: z.boolean(),
	publicity: PublicitySchema,
	playerRatings: typeutil.GenPlayerGroupSchema(RatingSchema),
});

/** Zod schema for ICN metadata. */
const MetaDataSchema = z.strictObject({
	Event: z.string().optional(),
	Site: z.literal('https://www.infinitechess.org/').optional(),
	TimeControl: TimeControlSchema.optional(),
	Round: z.literal('-').optional(),
	UTCDate: z.string().optional(),
	UTCTime: z.string().optional(),
	Variant: z.string().optional(),
	White: z.string().optional(),
	Black: z.string().optional(),
	WhiteID: z.string().optional(),
	BlackID: z.string().optional(),
	WhiteElo: z.string().optional(),
	BlackElo: z.string().optional(),
	WhiteRatingDiff: z.string().optional(),
	BlackRatingDiff: z.string().optional(),
	Result: z.string().optional(),
	Termination: z.string().optional(),
});

/**
 * Zod schema for a 'joingame' message value.
 * Extends GameUpdateMessageSchema with static game info, metadata, and player color.
 */
const JoinGameMessageSchema = GameUpdateMessageSchema.extend({
	gameInfo: ServerGameInfoSchema,
	metadata: MetaDataSchema,
	youAreColor: typeutil.PlayerSchema,
});

// General Schema ---------------------------------------------------------------

/** Zod schema for all possible incoming 'general' route messages from the server. */
const GeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('notify'), value: z.string() }),
	z.strictObject({ action: z.literal('notifyerror'), value: z.string() }),
	z.strictObject({ action: z.literal('print'), value: z.string() }),
	z.strictObject({ action: z.literal('printerror'), value: z.string() }),
	z.strictObject({ action: z.literal('renewconnection') }),
	z.strictObject({ action: z.literal('gameversion'), value: z.string() }),
]);

/** Represents all possible types an incoming 'general' route websocket message contents could be. */
export type GeneralMessage = z.infer<typeof GeneralSchema>;

// Invites Schema ---------------------------------------------------------------

/** Zod schema for all possible incoming 'invites' route messages from the server. */
const InvitesSchema = z.discriminatedUnion('action', [
	z.strictObject({
		action: z.literal('inviteslist'),
		value: z.strictObject({ invitesList: z.array(InviteSchema), currentGameCount: z.number() }),
	}),
	z.strictObject({ action: z.literal('gamecount'), value: z.number() }),
]);

/** Represents all possible types an incoming 'invites' route websocket message contents could be. */
export type InvitesMessage = z.infer<typeof InvitesSchema>;

// Game Schema ---------------------------------------------------------------

/** Zod schema for all possible incoming 'game' route messages from the server. */
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
		value: z.record(
			z.string(),
			z.strictObject({
				newRating: RatingSchema,
				change: z.number(),
			}),
		),
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
		value: z.strictObject({
			millisUntilAutoDisconnectResign: z.number(),
			wasByChoice: z.boolean(),
		}),
	}),
	z.strictObject({ action: z.literal('opponentdisconnectreturn') }),
	z.strictObject({ action: z.literal('drawoffer') }),
	z.strictObject({ action: z.literal('declinedraw') }),
]);

/** Represents all possible types an incoming 'game' route websocket message contents could be. */
export type GameMessage = z.infer<typeof GameSchema>;

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
