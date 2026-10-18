// src/server/game/gamemanager/modifierColumns.ts

/**
 * Maps a game's modifiers to and from the `mod_*` columns
 * that both `games` and `live_games` store them in.
 */

import type { GameModifier, SlideLimitValue } from '../../../shared/chess/util/modutil.js';

// Types -----------------------------------------------------------------------

/** The `mod_*` columns, one per modifier. NULL = that modifier is inactive. */
interface ModifierColumns {
	mod_slide_limit: number | null;
}

// Functions -------------------------------------------------------------------

/** The columns the given modifiers are stored as. */
function toColumns(modifiers: GameModifier[] | undefined): ModifierColumns {
	return { mod_slide_limit: modifiers?.find((m) => m.kind === 'slide-limit')?.value ?? null };
}

/** The modifiers stored in the given columns, or undefined if none are active. */
function fromColumns(columns: ModifierColumns): GameModifier[] | undefined {
	const modifiers: GameModifier[] = [];
	// Only ever written by toColumns, so it holds a valid value.
	if (columns.mod_slide_limit !== null)
		modifiers.push({ kind: 'slide-limit', value: columns.mod_slide_limit as SlideLimitValue });
	return modifiers.length > 0 ? modifiers : undefined;
}

// Exports ---------------------------------------------------------------------

export default { toColumns, fromColumns };
