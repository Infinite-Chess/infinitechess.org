// src/client/scripts/esm/game/websocket/socketschemas.ts

/**
 * This script defines all Zod schemas for validating incoming server websocket messages.
 *
 * All schemas are centralized here to avoid circular dependency issues — this file
 * only uses type-only imports from other modules, so it can never be part of a
 * circular dependency chain at runtime.
 *
 * Schemas are organized by route: general, invites, game, and a master schema
 * that combines them all together with echo and reply-only message handling.
 */

import type { Invite } from '../misc/invites.js';
import type { ClockValues } from '../../../../../shared/chess/logic/clock.js';
import type { PlayerGroup } from '../../../../../shared/chess/util/typeutil.js';
import type { OpponentDisconnectValue } from '../misc/onlinegame/disconnect.js';
import type { JoinGameMessage, LoggedGameInfo } from '../misc/onlinegame/onlinegamerouter.js';
import type {
	GameUpdateMessage,
	OpponentsMoveMessage,
	PlayerRatingChangeInfo,
} from '../../../../../server/game/gamemanager/gameutility.js';

import * as z from 'zod';

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
type GeneralMessage = z.infer<typeof GeneralSchema>;

// Invites Schema ---------------------------------------------------------------

/** Zod schema for all possible incoming 'invites' route messages from the server. */
const InvitesSchema = z.discriminatedUnion('action', [
	z.strictObject({
		action: z.literal('inviteslist'),
		value: z.strictObject({ invitesList: z.custom<Invite[]>(), currentGameCount: z.number() }),
	}),
	z.strictObject({ action: z.literal('gamecount'), value: z.number() }),
]);

/** Represents all possible types an incoming 'invites' route websocket message contents could be. */
type InvitesMessage = z.infer<typeof InvitesSchema>;

// Game Schema ---------------------------------------------------------------

/** Zod schema for all possible incoming 'game' route messages from the server. */
const GameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('joingame'), value: z.custom<JoinGameMessage>() }),
	z.strictObject({
		action: z.literal('logged-game-info'),
		value: z.custom<LoggedGameInfo>(),
	}),
	z.strictObject({ action: z.literal('move'), value: z.custom<OpponentsMoveMessage>() }),
	z.strictObject({ action: z.literal('clock'), value: z.custom<ClockValues>() }),
	z.strictObject({ action: z.literal('gameupdate'), value: z.custom<GameUpdateMessage>() }),
	z.strictObject({
		action: z.literal('gameratingchange'),
		value: z.custom<PlayerGroup<PlayerRatingChangeInfo>>(),
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
		value: z.custom<OpponentDisconnectValue>(),
	}),
	z.strictObject({ action: z.literal('opponentdisconnectreturn') }),
	z.strictObject({ action: z.literal('serverrestart'), value: z.number() }),
	z.strictObject({ action: z.literal('drawoffer') }),
	z.strictObject({ action: z.literal('declinedraw') }),
]);

/** Represents all possible types an incoming 'game' route websocket message contents could be. */
type GameMessage = z.infer<typeof GameSchema>;

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
		route: z.undefined(),
		id: z.number(),
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

export type { GeneralMessage, InvitesMessage, GameMessage };

export { MasterSchema };
