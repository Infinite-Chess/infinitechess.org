// src/shared/wsmessages.ts

/**
 * The client → server websocket contract: every action the client may send on each
 * route, and the payload each one carries.
 *
 * Single source of truth for both sides. The server validates incoming messages against
 * these schemas at the trust boundary; the client type-imports the inferred types to get
 * compile-time checking of what it sends. The client must NEVER value-import from here —
 * a type-only import is erased at build time, keeping the schemas out of its bundle.
 */

import * as z from 'zod';

import winconutil from './chess/util/winconutil.js';
import {
	CreateEngineGameMessageSchema,
	CreateSeekMessageSchema,
	GameIDSchema,
	SeekIdSchema,
} from './types.js';

// General Route ---------------------------------------------------------------

/**
 * The subscription lists a client may explicitly request
 * to unsub from (also the full set handled on socket close).
 */
export type ValidUnsub = (typeof validUnsubs)[number];
const validUnsubs = ['lobby', 'game', 'spectating'] as const;

/** Every message the client may send on the 'general' route. */
export type ClientGeneralMessage = z.infer<typeof ClientGeneralSchema>;
export const ClientGeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('sub'), value: z.literal(['lobby']) }),
	z.strictObject({ action: z.literal('unsub'), value: z.literal(validUnsubs) }),
]);

// Lobby Route -----------------------------------------------------------------

/** Every message the client may send on the 'lobby' route. */
export type ClientLobbyMessage = z.infer<typeof ClientLobbySchema>;
export const ClientLobbySchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('createseek'), value: CreateSeekMessageSchema }),
	z.strictObject({ action: z.literal('cancelseek'), value: SeekIdSchema }),
	z.strictObject({ action: z.literal('acceptseek'), value: SeekIdSchema }),
	z.strictObject({ action: z.literal('createengine'), value: CreateEngineGameMessageSchema }),
]);

// Game Route ------------------------------------------------------------------

/** Client → server websocket payload reporting an opponent for an illegal move. */
export type ReportMessage = z.infer<typeof ReportMessageSchema>;
const ReportMessageSchema = z.strictObject({
	/** The client's reason they reported their opponent. */
	reason: z.string(),
	opponentsMoveNumber: z.int(),
});

/** Client → server websocket payload for submitting a move. */
export type SubmitMoveMessage = z.infer<typeof SubmitMoveMessageSchema>;
const SubmitMoveMessageSchema = z.strictObject({
	move: z.string(),
	moveNumber: z.int(),
	gameConclusion: winconutil.gameConclusionSchema.optional(),
});

/** Every message the client may send on the 'game' route. */
export type ClientGameMessage = z.infer<typeof ClientGameSchema>;
export const ClientGameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('abort') }),
	z.strictObject({ action: z.literal('subscriberematch'), value: z.int() }),
	z.strictObject({ action: z.literal('offerdraw') }),
	z.strictObject({ action: z.literal('acceptdraw') }),
	z.strictObject({ action: z.literal('declinedraw') }),
	z.strictObject({ action: z.literal('offerrematch') }),
	z.strictObject({ action: z.literal('subscribe'), value: GameIDSchema }),
	z.strictObject({ action: z.literal('resign') }),
	z.strictObject({ action: z.literal('engineresign') }),
	z.strictObject({ action: z.literal('claimvictory') }),
	z.strictObject({ action: z.literal('claimdraw') }),
	z.strictObject({ action: z.literal('report'), value: ReportMessageSchema }),
	z.strictObject({ action: z.literal('submitmove'), value: SubmitMoveMessageSchema }),
]);
