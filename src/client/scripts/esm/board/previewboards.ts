// src/client/scripts/esm/board/previewboards.ts

/**
 * Builds the static start-position boards that previews draw: a preset's,
 * loading its variant module first, or a custom position's.
 */

import type { VariantCode } from '../../../../shared/chess/util/variantcodes.js';
import type { BoardPreview } from '../../../../shared/chess/logic/boardpreviewer.js';
import type { LoadedVariant, VariantOptions } from '../../../../shared/chess/logic/gamefile.js';

import variantcache from '../../../../shared/chess/variants/variantcache.js';
import variantrules from '../../../../shared/chess/logic/variantrules.js';
import apeironborder from '../../../../shared/chess/logic/apeironborder.js';
import boardpreviewer from '../../../../shared/chess/logic/boardpreviewer.js';

// Functions -------------------------------------------------------------------

/**
 * A preset variant's start position.
 * @param engineGame - Whether the engine would be the opponent, so the board carries the world
 * border an engine game is actually played on — the same one game construction resolves.
 */
async function ofPreset(code: VariantCode, engineGame = false): Promise<BoardPreview> {
	await variantcache.ensureVariantLoaded(code);
	const loadedVariant: LoadedVariant = {
		code,
		mod: variantcache.getModule(code),
		dateTimestamp: Date.now(),
	};
	const gameRules = variantrules.getGameRulesOfVariant(loadedVariant);
	if (engineGame && gameRules.worldBorder === undefined) {
		gameRules.worldBorder = apeironborder.forVariant(loadedVariant);
	}
	return boardpreviewer.init(gameRules, loadedVariant);
}

/** A custom position's start. Its world border, if any, is already in its rules. */
function ofPosition(variantOptions: VariantOptions): BoardPreview {
	return boardpreviewer.init(variantOptions.gameRules, undefined, { variantOptions });
}

// Exports ---------------------------------------------------------------------

export default {
	ofPreset,
	ofPosition,
};
