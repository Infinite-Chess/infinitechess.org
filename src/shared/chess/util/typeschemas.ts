// src/shared/chess/util/typeschemas.ts

/**
 * General zod schemas derived from the plain type constants.
 *
 * Deliberately NOT folded into typeutil.ts: that module is reached by the header
 * bundle every page loads, and by the analysis worker, none of which carry zod today.
 * Keeping the schemas here is what stops zod reaching them.
 */

import type { Player } from '../../util/typeutil.js';

import * as z from 'zod';

import { players } from '../../util/typeutil.js';

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
