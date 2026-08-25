// src/shared/chess/util/variantselection.ts

/**
 * How a variant is chosen: a preset code, or a custom position given as an ICN.
 *
 * Three shapes, differing only in whether the position travels with the selection —
 * each difference is a contract, not an accident. Only the preset half is shared.
 */

import * as z from 'zod';

import { VARIANT_CODES } from './variantcodes.js';

// Schemas ---------------------------------------------------------------------

/** One of the site's own variants, named by its code. The half every selection shares. */
type PresetVariant = z.infer<typeof PresetVariantSchema>;
const PresetVariantSchema = z.strictObject({
	kind: z.literal('preset'),
	code: z.enum(VARIANT_CODES),
});

/**
 * The variant selection as sent by the client when creating a seek, and the form a seek stores.
 * A saved position (cloud or local) is resolved to its ICN client-side and travels as 'custom'.
 */
export type SeekVariant = z.infer<typeof SeekVariantSchema>;
export const SeekVariantSchema = z.discriminatedUnion('kind', [
	PresetVariantSchema,
	z.strictObject({
		kind: z.literal('custom'),
		position: z.string().min(1),
	}),
]);

/**
 * The variant as broadcast to lobby viewers. ICN seeks omit the content so the
 * full ICN text is not sent to every connected client.
 */
export type OutSeekVariant = z.infer<typeof OutSeekVariantSchema>;
export const OutSeekVariantSchema = z.discriminatedUnion('kind', [
	PresetVariantSchema,
	z.strictObject({ kind: z.literal('custom') }),
]);

// Types -----------------------------------------------------------------------

/**
 * A game's variant: a preset `code`, or a `custom` game (position sourced from the ICN /
 * live state). A plain type, not a schema — it travels over HTTP and SSR, which the client
 * casts rather than validates.
 */
export type GameStateVariant =
	| PresetVariant
	| {
			kind: 'custom';
			/**
			 * The ICN the game's starting position was set from, carrying the source-variant
			 * tags (`Variant`/`UTCDate`/`UTCTime`) that identify what it's a position of.
			 * Present only on the live path — a dead game's comes from `DeadGameState.icn`.
			 */
			position?: string;
	  };
