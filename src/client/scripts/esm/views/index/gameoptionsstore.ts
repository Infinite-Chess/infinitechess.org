// src/client/scripts/esm/views/index/gameoptionsstore.ts

/**
 * Device-local persistence of the home page's game setup options, so every choice
 * the player made is still set the next time they open the lobby.
 */

import type { DisplaySelection } from '../../board/variantselector/variantselector.js';

import * as z from 'zod';

import modutil from '../../../../../shared/chess/util/modutil.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import { VARIANT_CODES } from '../../../../../shared/chess/util/variantcodes.js';

import IndexedDB from '../../util/IndexedDB.js';

// Constants -------------------------------------------------------------------

/** Name of the IndexedDB key for the remembered game setup options. */
const GAME_OPTIONS_NAME = 'game-setup-options';

/** How long remembered options survive without a return to the lobby. */
const EXPIRY_MS = 1000 * 60 * 60 * 24 * 365; // 1 year

// Schemas ---------------------------------------------------------------------

/** The variant the selector was left on. */
const SelectionSchema = z.union([
	z.strictObject({ kind: z.literal('preset'), code: z.literal(VARIANT_CODES) }),
	z.strictObject({ kind: z.enum(['cloud', 'local']), name: z.string() }),
	z.strictObject({ kind: z.literal('icn'), icn: z.string() }),
]) satisfies z.ZodType<DisplaySelection>;

/** Every game setup option remembered between visits to the lobby. */
export type GameOptions = z.infer<typeof GameOptionsSchema>;
const GameOptionsSchema = z.strictObject({
	selection: SelectionSchema,
	modifiers: z.array(modutil.GameModifierSchema),
	/** Base minutes per side, held to the base-time slider's ticks. */
	minutes: z.number().refine((v) => clockutil.VALID_BASE_MINUTES.includes(v)),
	/** Increment in seconds, held to the increment slider's ticks. */
	increment: z.number().refine((v) => clockutil.VALID_INCREMENT_SECS.includes(v)),
	/**
	 * The `data-*` value active in each toggle group. Plain strings, since the markup owns
	 * the options — a value is validated by looking its button up, not by a schema.
	 */
	toggles: z.strictObject({
		time: z.string(),
		mode: z.string(),
		side: z.string(),
		level: z.string(),
	}),
});

// Functions -------------------------------------------------------------------

/** Reads the remembered options, or undefined when there are none. */
async function read(): Promise<GameOptions | undefined> {
	const raw = await IndexedDB.loadItem(GAME_OPTIONS_NAME);
	if (raw === undefined) return undefined;

	const parsed = GameOptionsSchema.safeParse(raw);
	if (!parsed.success) {
		console.error('Corrupted game setup options found, clearing them.');
		clear();
		return undefined; // Start from defaults instead
	}
	return parsed.data;
}

/** Remembers the given options for the next visit to the lobby. */
function save(options: GameOptions): void {
	IndexedDB.saveItem(GAME_OPTIONS_NAME, options, EXPIRY_MS).catch((err: unknown) =>
		console.error('Failed to save game setup options:', err),
	);
}

/** Forgets the remembered options. */
function clear(): void {
	IndexedDB.deleteItem(GAME_OPTIONS_NAME).catch((err: unknown) =>
		console.error('Failed to clear game setup options:', err),
	);
}

// Exports ---------------------------------------------------------------------

export default { read, save };
