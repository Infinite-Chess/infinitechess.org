// src/server/controllers/seekProperties.ts

/**
 * Builds the display-ready view-model of a seek's properties — its variant, time control,
 * whether it's rated, and how its rules depart from the standard ones. A game shows the
 * properties of the seek it was created from.
 */

import type { Request } from 'express';
import type { GameRules } from '../../shared/chess/util/gamerules.js';
import type { VariantIcon } from '../../shared/chess/variants/varianticons.js';
import type { StaticGameSetup } from '../../shared/transport/domain.js';
import type { GlobalGameState } from '../../shared/chess/logic/state.js';

import clockutil from '../../shared/chess/util/clockutil.js';
import icnimport from '../../shared/chess/logic/icn/icnimport.js';
import variantcache from '../../shared/chess/variants/variantcache.js';
import icnconverter from '../../shared/chess/logic/icn/icnconverter.js';
import variantrules from '../../shared/chess/logic/variantrules.js';
import variantregistry from '../../shared/chess/variants/variantregistry.js';
import { summarizeGameRules } from '../../shared/chess/variants/gamerulesummary.js';
import { resolveVariantIcons } from '../../shared/chess/variants/varianticons.js';

import pieceSvgCache from '../config/pieceSvgCache.js';

// Types -----------------------------------------------------------------------

/** Display-ready seek properties, precomputed since Nunjucks can't call the shared utils. */
export interface SeekPropertiesViewModel {
	/** The variant's icons and display name (a custom game falls back to a generic pair). */
	variant: { icons: VariantIcon[]; name: string };
	/**
	 * How the rules depart from the standard ones. Empty when it plays entirely by the
	 * defaults, in which case the page omits the row. Matches, line for line, what the
	 * variant preview tooltip shows on the seek.
	 */
	rules: RuleLineViewModel[];
	/** Speed category icon id + display name, for the speed badge. */
	speed: { iconId: string; name: string };
	/** User-facing `m+s` label, or empty for untimed games. */
	timeControl: string;
	/** "Rated" or "Casual". */
	mode: string;
}

/**
 * One line of the gamerule summary, ready to print. A promotion
 * line's pieces arrive as the raw `<svg>` markup to inline.
 */
type RuleLineViewModel =
	| { kind: 'text'; text: string }
	| { kind: 'promotion'; prefix: string; svgs: string[]; suffix: string };

// View Model ------------------------------------------------------------------

/**
 * Derives the display-ready {@link SeekPropertiesViewModel} of a setup.
 * @param deadIcn - A concluded custom game's ICN, whose setup no longer carries its position.
 */
function build(
	setup: StaticGameSetup,
	rated: boolean,
	deadIcn: string | undefined,
	req: Request,
): SeekPropertiesViewModel {
	const variantGroup =
		setup.variant.kind === 'preset' ? variantregistry.getGroup(setup.variant.code) : 'custom';
	const variantCode = setup.variant.kind === 'preset' ? setup.variant.code : null;
	return {
		variant: {
			name: variantregistry.getDisplayName(variantCode, req.t.shared),
			icons: resolveVariantIcons(variantGroup, setup.modifiers),
		},
		rules: buildRuleLines(setup, deadIcn, req),
		speed: {
			iconId: clockutil.getSpeedIconId(setup.timeControl),
			name: req.t.shared.speeds[clockutil.getSpeedCategory(setup.timeControl)],
		},
		timeControl: clockutil.getTimeControlLabel(setup.timeControl),
		mode: rated ? req.t.shared.game_modes.rated : req.t.shared.game_modes.casual,
	};
}

// Gamerule summary ------------------------------------------------------------

/**
 * Summarizes how a game's rules depart from the standard ones, resolving
 * each promotion piece to the SVG markup the page inlines for it.
 */
function buildRuleLines(
	setup: StaticGameSetup,
	deadIcn: string | undefined,
	req: Request,
): RuleLineViewModel[] {
	const { gameRules, state_global } = resolveGameRules(setup, deadIcn);
	const variantCode = setup.variant.kind === 'preset' ? setup.variant.code : undefined;
	const items = summarizeGameRules(gameRules, state_global, variantCode, setup.modifiers, req.t.shared); // prettier-ignore

	return items.map((item): RuleLineViewModel => {
		if (item.kind === 'text') return item;
		const { prefix, pieces, suffix } = item;
		return {
			kind: 'promotion',
			prefix,
			svgs: pieces.map((piece) => pieceSvgCache.get(piece)),
			suffix,
		};
	});
}

/**
 * Resolves the rules a game is played by, the same way game construction does: a preset
 * variant rebuilds them from its module, a custom position reads them off its ICN.
 * @param deadIcn - A concluded custom game's ICN. Ignored for a preset, which carries its own rules.
 */
function resolveGameRules(
	setup: StaticGameSetup,
	deadIcn: string | undefined,
): { gameRules: GameRules; state_global: GlobalGameState | undefined } {
	if (setup.variant.kind === 'preset') {
		const loaded = {
			code: setup.variant.code,
			mod: variantcache.getModule(setup.variant.code), // Every module is preloaded at startup
			dateTimestamp: setup.timeCreated,
		};
		// A preset always starts clean, so it has no global state worth summarizing.
		return {
			gameRules: variantrules.getGameRulesOfVariant(loaded),
			state_global: undefined,
		};
	}
	// A live game or open seek carries its start position in its setup; a concluded
	// one's is the database record. One of the two is always present.
	const icn = setup.variant.position ?? deadIcn;
	if (icn === undefined) throw new Error('Custom game has no ICN to read its rules from.');

	const longFormat = icnconverter.ShortToLong_Format(icn);
	const { gameRules, state_global } = icnimport.variantOptionsFromLongFormat(longFormat);
	return { gameRules, state_global };
}

// Exports ---------------------------------------------------------------------

export default { build };
