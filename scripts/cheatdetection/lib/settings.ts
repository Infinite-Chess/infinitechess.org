// scripts/cheatdetection/lib/settings.ts

/**
 * Where the research reads and writes, and the knobs experiments vary, from `--name=value` flags
 * so no experiment edits code:
 *
 *   --snapshot=<path>                 a copy of prod's database (required by scripts reading games)
 *   --data=<dir>                      the research's outputs (default sandbox/cheatdetection, gitignored)
 *   --ceiling=base,perRating,margin   the skill ceiling (default: the shipped model's)
 *   --fractions=0.1,0.25,0.5,1        the cheat fractions bet on (default: the shipped model's)
 *   --top-margin=0.05                 the honest top-rate margin (default: the shipped model's)
 *   --case-line=1000                  the score that opens a case (default: the shipped line)
 *   --multipv=5                       the lines the detector searches, 1–5 (default: production's)
 */

import type { BetModel } from '../../../src/server/game/cheatdetection/bettingScore.js';
import type { DetectorSearch } from '../../../src/server/game/cheatdetection/cheatDetectionTypes.js';

import path from 'node:path';

import bettingScore from '../../../src/server/game/cheatdetection/bettingScore.js';
import engineAnalysis from '../../../src/server/game/cheatdetection/engineAnalysis.js';

// Flags -----------------------------------------------------------------------

/** A `--name=value` flag's value, if given. */
function flag(name: string): string | undefined {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/** The arguments that aren't flags, after the script's own path. */
function positional(): string[] {
	return process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
}

// Constants -------------------------------------------------------------------

const DATA_DIR = path.resolve(flag('data') ?? 'sandbox/cheatdetection');
/** The engine build the site serves, as downloaded into the client package. */
const ENGINE_PKG = path.resolve('src/client/pkg/apeiron/pkg');

const ceiling = flag('ceiling')?.split(',').map(Number);
const SKILL_CEILING: BetModel['skillCeiling'] = ceiling
	? { base: ceiling[0]!, perRating: ceiling[1]!, margin: ceiling[2]! }
	: bettingScore.MODEL.skillCeiling;

const CHEAT_FRACTIONS: number[] =
	flag('fractions')?.split(',').map(Number) ?? bettingScore.MODEL.cheatFractions;

const topMargin = flag('top-margin');
const TOP_MARGIN = topMargin ? Number(topMargin) : bettingScore.MODEL.honestTopMargin;

const caseLine = flag('case-line');
const CASE_LOG_SCORE = caseLine ? Math.log(Number(caseLine)) : bettingScore.CASE_LOG_SCORE;

const multiPv = flag('multipv');
const SEARCH: DetectorSearch = multiPv
	? { ...engineAnalysis.SEARCH, multiPv: Number(multiPv) }
	: engineAnalysis.SEARCH;

// Functions -------------------------------------------------------------------

/** The prod snapshot's path. Throws when not given, since every game comes from it. */
function snapshotPath(): string {
	const snapshot = flag('snapshot');
	if (!snapshot) throw Error("Pass --snapshot=<path> to a copy of prod's database.");
	return snapshot;
}

/** The settings an experiment ran with, for its output's first line. */
function describe(): string {
	const { base, perRating, margin } = SKILL_CEILING;
	return `MultiPV ${SEARCH.multiPv}, ceiling ${base},${perRating},${margin}, fractions ${CHEAT_FRACTIONS.join(',')}, top margin ${TOP_MARGIN}, case line ${Math.round(Math.exp(CASE_LOG_SCORE))}`; // prettier-ignore
}

// Exports ---------------------------------------------------------------------

export default {
	// Flags
	flag,
	positional,
	// Constants
	DATA_DIR,
	ENGINE_PKG,
	SKILL_CEILING,
	CHEAT_FRACTIONS,
	TOP_MARGIN,
	CASE_LOG_SCORE,
	SEARCH,
	// Functions
	snapshotPath,
	describe,
};
