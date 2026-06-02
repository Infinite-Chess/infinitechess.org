// src/shared/chess/util/typeschemas.ts

/**
 * General zod schemas derived from the plain type constants.
 */

import type { Player } from './typeutil.js';

import * as z from 'zod';

import { players } from './typeutil.js';

/** Zod schema for a player color. */
const PlayerSchema = z.literal(Object.values(players));

/** Returns the Zod schema corresponding to {@link PlayerGroup}, accepting the schema of the values as an argument. */
function GenPlayerGroupSchema<T extends z.ZodTypeAny>(
	valueSchema: T,
): z.ZodObject<{ [K in Player]: z.ZodOptional<T> }> {
	const shape = Object.fromEntries(
		Object.values(players).map((p) => [p, valueSchema.optional()]),
	);
	return z.strictObject(shape as { [K in Player]: z.ZodOptional<T> });
}

export default { PlayerSchema, GenPlayerGroupSchema };
