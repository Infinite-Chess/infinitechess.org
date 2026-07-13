// src/client/scripts/esm/views/analysis/analysissetup.ts

/**
 * The plain /analysis page's variant setup panel: wires the shared variant selector
 * widget so that committing a selection (a preset, saved position, or ICN) — or toggling
 * a modifier — loads that position onto the analysis board.
 *
 * Only used on /analysis (not /analysis/:id, which renders no setup panel). Loaded
 * dynamically so its variant-selector imports never run where the widget DOM is absent.
 */

import gamesession from '../../game/chess/gamesession.js';
import { GameBus } from '../../game/GameBus.js';
import analysisloader from './analysisloader.js';
import variantSelector from '../../components/variantselector/variantSelector.js';
import modifierSelector from '../../components/variantselector/modifierSelector.js';

/** Wires the widget's commit callbacks to load the selection onto the board. */
function init(): void {
	// Allow analyzing positions of any size.
	variantSelector.initVariantGroupDropdown({ enforceSizeLimit: false, onCommit: loadSelection });
	variantSelector.initIcnValidation();
	modifierSelector.initModifierSelector({ onCommit: loadSelection });
	// A move on the board abandons any un-committed selection (e.g. an opened, empty From-ICN
	// field), so snap the display back to the variant actually loaded on the board.
	GameBus.addEventListener('physical-move', () => variantSelector.restoreAcceptedDisplay());
}

/** The active Slide Limit modifier as a bigint gamerule, or undefined if none is selected. */
function getSelectedSlideLimit(): bigint | undefined {
	for (const modifier of modifierSelector.getSeekModifiers()) {
		if (modifier.kind === 'slide-limit') return BigInt(modifier.value);
	}
	return undefined;
}

/** Loads the variant selector's current selection onto the board (fresh preset or custom ICN). */
function loadSelection(): void {
	if (gamesession.isLoading()) return; // Don't stomp an in-flight load.

	const slideLimit = getSelectedSlideLimit();
	const selection = variantSelector.getSelection();

	if (selection.kind === 'preset') {
		analysisloader.loadVariant(selection.code, slideLimit);
	} else {
		// Custom (saved position or ICN) — only load once it resolves to a legal position.
		const custom = variantSelector.getCustomPosition();
		if (custom === null) return;
		if (custom.kind === 'options') {
			// Saved position — load the resolved options directly (no ICN round-trip).
			void analysisloader.loadVariantOptions(custom.options, slideLimit);
		} else {
			// From-ICN
			void analysisloader.pasteGame(custom.icn, undefined, undefined, slideLimit);
		}
	}

	// Remember what's now loaded, so a later board move can revert the display to it.
	variantSelector.snapshotAccepted();
}

export default { init };
