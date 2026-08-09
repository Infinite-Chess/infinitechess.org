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
	GameConclusionMessageSchema,
	GameIDSchema,
	GameStateMessageSchema,
	InGameMessageSchema,
	LobbyStateMessageSchema,
	OpponentsMoveMessageSchema,
	RematchOfferInfoSchema,
	SeeksListSchema,
	ViewerCountSchema,
} from '../../../../shared/types.js';

// General Schema ---------------------------------------------------------------

/** Represents all possible types an incoming 'general' route websocket message contents could be. */
export type GeneralMessage = z.infer<typeof GeneralSchema>;
const GeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('notify'), value: z.string() }),
	z.strictObject({ action: z.literal('notifyerror'), value: z.string() }),
	z.strictObject({ action: z.literal('print'), value: z.string() }),
	z.strictObject({ action: z.literal('printerror'), value: z.string() }),
	z.strictObject({ action: z.literal('ping') }),
	z.strictObject({ action: z.literal('protocolversion'), value: z.number() }),
]);

// Lobby Schema ---------------------------------------------------------------

/** Represents all possible types an incoming 'lobby' route websocket message contents could be. */
export type LobbyMessage = z.infer<typeof LobbySchema>;
const LobbySchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('lobbystate'), value: LobbyStateMessageSchema }),
	z.strictObject({
		action: z.literal('seekslist'),
		value: z.strictObject({
			seeksList: SeeksListSchema,
		}),
	}),
	z.strictObject({ action: z.literal('viewercount'), value: ViewerCountSchema }),
	z.strictObject({ action: z.literal('ingame'), value: InGameMessageSchema }),
	z.strictObject({ action: z.literal('outgame') }),
]);

// Game Schema ---------------------------------------------------------------

/** All possible types an incoming 'game' route websocket message contents could be. */
export type GameMessage = z.infer<typeof GameSchema>;
const GameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('gamestate'), value: GameStateMessageSchema }),
	z.strictObject({ action: z.literal('move'), value: OpponentsMoveMessageSchema }),
	z.strictObject({ action: z.literal('clock'), value: ClockValuesSchema }),
	z.strictObject({
		action: z.literal('gameconclusion'),
		value: GameConclusionMessageSchema,
	}),
	z.strictObject({
		action: z.literal('gameratingchange'),
		value: typeschemas.GenPlayerGroupSchema(z.number()),
	}),
	z.strictObject({ action: z.literal('unsub') }),
	z.strictObject({ action: z.literal('login') }),
	z.strictObject({ action: z.literal('notlive') }),
	z.strictObject({ action: z.literal('leavegame') }),
	z.strictObject({
		action: z.literal('opponentdisconnect'),
		value: DisconnectInfoSchema,
	}),
	z.strictObject({ action: z.literal('opponentdisconnectreturn') }),
	z.strictObject({ action: z.literal('drawoffer') }),
	z.strictObject({ action: z.literal('declinedraw') }),
	z.strictObject({ action: z.literal('finalized') }),
	z.strictObject({ action: z.literal('rematchstate'), value: RematchOfferInfoSchema }),
	z.strictObject({ action: z.literal('rematchoffer') }),
	z.strictObject({ action: z.literal('opponentleft') }),
	z.strictObject({ action: z.literal('opponentreturn') }),
	z.strictObject({ action: z.literal('ingame'), value: GameIDSchema }),
]);

// Master Schema ---------------------------------------------------------------

/** The schema for validating all incoming websocket messages. */
const MasterSchema = z.discriminatedUnion('route', [
	// Echo messages
	z.strictObject({
		route: z.literal('echo'),
		contents: z.number(),
	}),
	// Routed messages
	z.strictObject({
		id: z.number(),
		route: z.literal('general'),
		contents: GeneralSchema,
	}),
	z.strictObject({
		id: z.number(),
		route: z.literal('lobby'),
		contents: LobbySchema,
	}),
	z.strictObject({
		id: z.number(),
		route: z.literal('game'),
		contents: GameSchema,
	}),
]);

// Exports ---------------------------------------------------------------

export { MasterSchema };
