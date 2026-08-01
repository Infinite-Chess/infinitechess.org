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
	variantSelector.initVariantGroupDropdown({ isSeekContext: false, onCommit: loadSelection });
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

/** Whether a load was refused mid-load, owed once the in-flight one finishes. */
let loadOwed = false;

/** Loads the variant selector's current selection onto the board (fresh preset or custom ICN). */
function loadSelection(): void {
	// Don't stomp an in-flight load — an unloaded gamefile would crash its graphical
	// half. Owe it instead, so a modifier toggle made mid-load isn't silently swallowed.
	if (gamesession.isLoading()) {
		loadOwed = true;
		return;
	}

	const slideLimit = getSelectedSlideLimit();
	const selection = variantSelector.getSelection();

	let load: Promise<void>;
	if (selection.kind === 'preset') {
		load = analysisloader.loadVariant(selection.code, slideLimit);
	} else {
		// Custom (saved position or ICN) — only load once it resolves to a legal position.
		const custom = variantSelector.getCustomPosition();
		if (custom === null) return;
		if (custom.kind === 'options') {
			// Saved position — its options are already resolved; load them directly.
			load = analysisloader.loadVariantOptions(custom.options, slideLimit);
		} else {
			// From-ICN — load the parsed position the validation gate already produced.
			load = analysisloader.pasteGame(custom.longFormat, undefined, undefined, slideLimit);
		}
	}

	// Remember what's now loaded, so a later board move can revert the display to it.
	variantSelector.snapshotAccepted();

	// Settles even if the load errored, so an owed load is never stranded. Deliberately not
	// the 'graphical-loaded' event, whose listeners run mid-dispatch against this very gamefile.
	void load.then(drainOwedLoad);
}

/** Runs the load refused during the one that just finished, re-reading the selection fresh. */
function drainOwedLoad(): void {
	if (!loadOwed) return;
	loadOwed = false;
	loadSelection();
}

export default { init };
