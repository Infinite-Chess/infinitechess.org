// src/shared/chess/util/typeschemas.ts

/**
 * Chess-vocabulary zod schemas held apart from the modules whose types they describe,
 * so those modules stay free of zod.
 *
 * The header bundle every page loads reaches typeutil.ts, and the engine workers reach
 * icnconverter.ts, which reads winconutil.ts. None of them carry zod, and keeping the
 * schemas here is what stops it arriving — by two different routes. typeutil.ts sits BELOW
 * this rung, so it cannot import from here at all. The others sit at or above it and may,
 * but take only the inferred TYPE, which esbuild erases.
 */

import type { Player } from './typeutil.js';

import * as z from 'zod';

import winconutil from './winconutil.js';
import { players } from './typeutil.js';

// Constants -------------------------------------------------------------------

/** Zod schema for a player color. */
const PlayerSchema = z.literal(Object.values(players));

/**
 * A move as transmitted over the wire, or as parsed out of
 * an ICN: the serialized move token (e.g. `"1,2>3,4=N"`).
 */
export type MovePacket = z.infer<typeof MovePacketSchema>;
const MovePacketSchema = z.strictObject({
	token: z.string(),
	/** Only ever set by the ICN parser, for the analysis page's per-move clocks. Never sent over the wire. */
	clockStamp: z.number().optional(),
});

/** Stores the results of a game, including how it was terminated, and who won. */
export type GameConclusion = z.infer<typeof GameConclusionSchema>;
const GameConclusionSchema = z.discriminatedUnion('condition', [
	z.strictObject({
		condition: z.enum(winconutil.WIN_CONDITIONS),
		victor: PlayerSchema,
	}),
	z.strictObject({
		condition: z.enum(winconutil.DRAW_CONDITIONS),
		victor: z.literal(null),
	}),
	z.strictObject({
		condition: z.literal('aborted'),
		victor: z.undefined().optional(), // Allows accidental inclusion of undefined victor
	}),
]);

// Functions -------------------------------------------------------------------

/**
 * Builds the Zod schema for typeutil's `PlayerGroup<T>`.
 * @param valueSchema - The schema each player's value must satisfy.
 */
function GenPlayerGroupSchema<T extends z.ZodTypeAny>(
	valueSchema: T,
): z.ZodObject<{ [K in Player]: z.ZodOptional<T> }> {
	const shape = Object.fromEntries(
		Object.values(players).map((p) => [p, valueSchema.optional()]),
	);
	return z.strictObject(shape as { [K in Player]: z.ZodOptional<T> });
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	PlayerSchema,
	MovePacketSchema,
	GameConclusionSchema,
	// Functions
	GenPlayerGroupSchema,
};
