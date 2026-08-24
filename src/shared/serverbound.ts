// src/shared/serverbound.ts

/**
 * The SERVERBOUND websocket contract: every action the client may send on each route,
 * and the payload each one carries. See clientbound.ts for the opposite direction.
 *
 * Single source of truth for both sides. The server validates incoming messages against
 * these schemas at the trust boundary; the client type-imports the inferred types to get
 * compile-time checking of what it sends. The client must NEVER value-import from here —
 * a type-only import is erased at build time, keeping the schemas out of its bundle.
 *
 * A schema belongs here if it exists ONLY as websocket message contents; anything
 * another transport also carries is owned and imported by domain.ts or elsewhere.
 */

import * as z from 'zod';

import winconutil from './chess/util/winconutil.js';
import { players } from './util/typeutil.js';
import { isRatedAllowed } from './chess/variants/servervalidation.js';
import { SeekVariantSchema } from './chess/variants/variantselection.js';
import { GameModifierSchema } from './util/modutil.js';
import clockutil, { TimeControlSchema } from './chess/util/clockutil.js';
import { GameIDSchema, GameModeSchema, SeekIdSchema } from './domain.js';

// General Route ---------------------------------------------------------------

/**
 * Every message the client may send on the 'general' route.
 *
 * The lobby is the only stream a client attaches to and detaches from in place — a game
 * attaches over the game route (`subscribe`, which needs an id) and detaches on socket
 * close, since leaving the game page is a navigation.
 */
export type ServerboundGeneralMessage = z.infer<typeof ServerboundGeneralSchema>;
const ServerboundGeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('sub'), value: z.literal(['lobby']) }),
	z.strictObject({ action: z.literal('unsub'), value: z.literal(['lobby']) }),
]);

// Lobby Route -----------------------------------------------------------------

/** Client → server websocket payload for creating a seek — exactly what the game setup form produces. */
export type CreateSeekMessage = z.infer<typeof CreateSeekMessageSchema>;
const CreateSeekMessageSchema = z
	.strictObject({
		variant: SeekVariantSchema,
		time: TimeControlSchema.refine(
			(timeControl) => clockutil.isTimedControlValid(timeControl),
			{
				error: 'Invalid clock value.',
			},
		),
		color: z.literal([players.WHITE, players.BLACK, null]),
		mode: GameModeSchema,
		modifiers: z.array(GameModifierSchema).max(GameModifierSchema.options.length).optional(),
	})
	.refine(
		(val) =>
			val.mode !== 'rated' || isRatedAllowed(val.variant, val.time, val.color, val.modifiers),
		{ error: 'Invalid seek parameters for a rated game.' },
	);

/** Client → server websocket payload for creating an engine game. */
export type CreateEngineGameMessage = z.infer<typeof CreateEngineGameMessageSchema>;
const CreateEngineGameMessageSchema = z.strictObject({
	variant: SeekVariantSchema,
	time: TimeControlSchema.refine((timeControl) => clockutil.isTimedControlValid(timeControl), {
		error: 'Invalid clock value.',
	}),
	/** The color the human plays, or null for random. */
	color: z.literal([players.WHITE, players.BLACK, null]),
	/** The engine's strength level (validated against the engine's max server-side). */
	strengthLevel: z.int().min(1),
});

/** Every message the client may send on the 'lobby' route. */
export type ServerboundLobbyMessage = z.infer<typeof ServerboundLobbySchema>;
const ServerboundLobbySchema = z.discriminatedUnion('action', [
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
export type ServerboundGameMessage = z.infer<typeof ServerboundGameSchema>;
const ServerboundGameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('abort') }),
	z.strictObject({ action: z.literal('subscriberematch'), value: GameIDSchema }),
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

// Envelope --------------------------------------------------------------------

/**
 * The envelope fields common to every routed message.
 *
 * `needsack` asks the server to send an `ack` back once this message has been handled, so the
 * client knows the action is no longer outstanding. Set only on the user actions the client
 * locks; omitted (never `false`) on everything else, so the two states have one encoding each.
 */
const RoutedEnvelope = { id: z.int(), needsack: z.literal(true).optional() };

/** A routed (non-echo) message, wrapped in the envelope it travels in. */
export type ServerboundRoutedMessage = z.infer<typeof ServerboundRoutedSchema>;
const ServerboundRoutedSchema = z.discriminatedUnion('route', [
	z.strictObject({
		...RoutedEnvelope,
		route: z.literal('general'),
		contents: ServerboundGeneralSchema,
	}),
	z.strictObject({
		...RoutedEnvelope,
		route: z.literal('lobby'),
		contents: ServerboundLobbySchema,
	}),
	z.strictObject({
		...RoutedEnvelope,
		route: z.literal('game'),
		contents: ServerboundGameSchema,
	}),
]);

/** The client's echo of a message we sent them. Carries only the id being echoed. */
const EchoSchema = z.strictObject({
	route: z.literal('echo'),
	contents: z.int(),
});

/** Every serverbound message, envelope included. What the server validates against. */
export type ServerboundMessage = z.infer<typeof ServerboundSchema>;
export const ServerboundSchema = z.discriminatedUnion('route', [
	ServerboundRoutedSchema,
	EchoSchema,
]);
