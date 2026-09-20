// src/shared/chess/variants/varianticons.ts

/**
 * Resolves the icons a seek or game is identified by: its variant group's, and one
 * per modifier it carries.
 *
 * Returns ids, not markup, so every surface that reads a seek back renders the one
 * list its own way.
 */

import type { GameModifier } from '../util/modutil.js';
import type { VariantGroup } from './variantregistry.js';

import modutil from '../util/modutil.js';
import variantregistry from './variantregistry.js';

// Types -----------------------------------------------------------------------

/** One icon in the line a seek or game is identified by. */
export type VariantIcon = {
	/** The SVG symbol id. */
	id: string;
	/** Modifier icons (at least the slide limit icon) render slightly
	 * larger than a group's, so each renderer must tell them apart. */
	isModifier: boolean;
};

// Functions -------------------------------------------------------------------

/** Returns the icons identifying a variant and its modifiers, in display order. */
export function resolveVariantIcons(
	group: VariantGroup | 'custom',
	modifiers: GameModifier[] | undefined,
): VariantIcon[] {
	const icons: VariantIcon[] = (modifiers ?? []).map((m) => ({
		id: modutil.getModifierIconId(m.kind),
		isModifier: true,
	}));
	// A modified 'standard' game drops its group icon.
	if (group === 'standard' && icons.length > 0) return icons;
	return [{ id: variantregistry.getGroupIconId(group), isModifier: false }, ...icons];
}
