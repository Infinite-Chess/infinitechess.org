// src/client/scripts/esm/game/gui/guimaterial.ts

/**
 * Manages the two `.material` captured-material bars on the game page: the bottom
 * bar (our POV, or white for spectators) and the top bar (the opponent, or black).
 *
 * Each bar shows only its side's *surplus* silhouettes after canceling like piece
 * types against the other side, plus a `+X` estimated point lead on the side that's
 * net ahead.
 *
 * Recomputed on every `view-move` so rewinding reflects the material at
 * that point in time. Disabled entirely for games whose starting position is
 * unbalanced (either side starts with an unequal count of any piece type).
 */

import type { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';
import type { Player, RawType } from '../../../../../shared/chess/util/typeutil.js';

import boardutil from '../../../../../shared/chess/util/boardutil.js';
import typeutil, { rawTypes, players as p } from '../../../../../shared/chess/util/typeutil.js';

import gameslot from '../chess/gameslot.js';
import svgcache from '../../chess/rendering/svgcache.js';
import gamesession from '../chess/gamesession.js';
import { GameBus } from '../GameBus.js';

// Point values --------------------------------------------------------------------------------

/**
 * Estimated point value of each raw piece type, used only to compute the `+X` lead
 * shown on the net-ahead side. Types absent here (royals, neutrals) count as 0.
 */
const RAW_PIECE_VALUES: Partial<Record<RawType, number>> = {
	[rawTypes.PAWN]: 1,
	[rawTypes.KNIGHT]: 3,
	[rawTypes.GUARD]: 2,
	[rawTypes.KING]: 2,
	[rawTypes.BISHOP]: 4,
	[rawTypes.ROOK]: 6,
	[rawTypes.ARCHBISHOP]: 9,
	[rawTypes.CHANCELLOR]: 10,
	[rawTypes.QUEEN]: 13,
	[rawTypes.ROYALQUEEN]: 13,
	// Fairy pieces
	[rawTypes.CAMEL]: 3,
	[rawTypes.ZEBRA]: 3,
	[rawTypes.GIRAFFE]: 3,
	[rawTypes.HAWK]: 6,
	[rawTypes.CENTAUR]: 6,
	[rawTypes.ROYALCENTAUR]: 6,
	[rawTypes.HUYGEN]: 5,
	[rawTypes.KNIGHTRIDER]: 7,
	[rawTypes.ROSE]: 7,
	[rawTypes.AMAZON]: 16,
};

// Elements ------------------------------------------------------------------------------------

const element_MaterialTop = document.getElementById('material-top')!;
const element_MaterialBottom = document.getElementById('material-bottom')!;

// Variables -----------------------------------------------------------------------------------

/**
 * Whether the loaded game's starting position is balanced (all sides start with an equal count
 * of every piece type, and only white & black are present). Material bars are disabled otherwise
 * Computed on `graphical-loaded`.
 */
let balanced = false;

// Events --------------------------------------------------------------------------------------

// Recompute `balance` from the freshly-loaded start position, then render the current material.
// Must be 'graphical-loaded' — see the SVG cache note in render().
GameBus.addEventListener('graphical-loaded', () => {
	const gamefile = gameslot.getGamefile()!;
	balanced = isStartPositionBalanced(gamefile.startSnapshot.position);
	// Unbalanced games never show material differences, so hide the bars to reclaim their space.
	element_MaterialTop.classList.toggle('hidden', !balanced);
	element_MaterialBottom.classList.toggle('hidden', !balanced);
	render();
});
// A discarded load leaves no gamefile to compute a surplus from, so drop the flag that
// would otherwise let render() reach for one until the next game recomputes it.
GameBus.addEventListener('game-unloaded', () => (balanced = false));
// Rewinding/forwarding restores the board to the viewed move, so the live counts already reflect it.
GameBus.addEventListener('view-move', () => render());
GameBus.addEventListener('board-flipped', () => render());

// Balance detection ---------------------------------------------------------------------------

/**
 * Tests whether a starting position is balanced: every raw piece type must have equal white and
 * black counts, and no piece may belong to a player other than white/black (neutrals ignored).
 * Unbalanced positions (horde, showcase, asymmetric customs) disable the bars.
 */
function isStartPositionBalanced(position: Map<CoordsKey, number>): boolean {
	/** rawType => white count − black count. Balanced iff every entry ends at 0. */
	const diffs = new Map<RawType, number>();
	for (const type of position.values()) {
		const [raw, player] = typeutil.splitType(type);
		if (player === p.NEUTRAL) continue; // Voids / obstacles don't belong to either side.
		if (player !== p.WHITE && player !== p.BLACK) return false; // A 3rd+ player — can't be balanced across two bars.
		diffs.set(raw, (diffs.get(raw) ?? 0) + (player === p.WHITE ? 1 : -1));
	}
	for (const diff of diffs.values()) if (diff !== 0) return false;
	return true;
}

// Rendering -----------------------------------------------------------------------------------

/** The net material surplus of each side at the currently-viewed move, and the point lead. */
interface MaterialSurplus {
	/** rawType => surplus count this side has over the other (only positive entries). */
	white: Map<RawType, number>;
	black: Map<RawType, number>;
	/** Estimated point lead: positive if white is ahead, negative if black, 0 if even. */
	pointLead: number;
}

/** Computes each side's surplus and the point lead from the live piece counts at the viewed move. */
function computeSurplus(): MaterialSurplus {
	const gamefile = gameslot.getGamefile()!;
	const white = new Map<RawType, number>();
	const black = new Map<RawType, number>();
	let pointLead = 0;

	for (const raw of gamefile.existingRawTypes) {
		const whiteCount = boardutil.getPieceCountOfType(gamefile.pieces, typeutil.buildType(raw, p.WHITE)); // prettier-ignore
		const blackCount = boardutil.getPieceCountOfType(gamefile.pieces, typeutil.buildType(raw, p.BLACK)); // prettier-ignore
		const diff = whiteCount - blackCount;
		if (diff > 0) white.set(raw, diff);
		else if (diff < 0) black.set(raw, -diff);
		pointLead += diff * (RAW_PIECE_VALUES[raw] ?? 0);
	}

	return { white, black, pointLead };
}

/** Rebuilds both bars from the material surplus at the currently-viewed move. */
function render(): void {
	// Surplus silhouettes are cloned straight from the SVG cache, which only the graphical load
	// populates for non-classical pieces. The 'graphical-loaded' listener rebuilds both bars.
	if (gamesession.isLoading()) return;

	if (!balanced) {
		element_MaterialTop.replaceChildren();
		element_MaterialBottom.replaceChildren();
		return;
	}

	const { white, black, pointLead } = computeSurplus();

	// Map each side to its bar by perspective: bottom = our POV (or white for spectators).
	const bottomPlayer: Player = gameslot.areViewingWhite() ? p.WHITE : p.BLACK;
	const topPlayer: Player = typeutil.invertPlayer(bottomPlayer);
	const surplusOf = (player: Player): Map<RawType, number> =>
		player === p.WHITE ? white : black;
	const leadOf = (player: Player): number => (player === p.WHITE ? pointLead : -pointLead);

	const bottom = buildBarChildren(surplusOf(bottomPlayer), leadOf(bottomPlayer));
	const top = buildBarChildren(surplusOf(topPlayer), leadOf(topPlayer));
	element_MaterialBottom.replaceChildren(...bottom);
	element_MaterialTop.replaceChildren(...top);
}

/**
 * Builds one bar's children: a silhouette per surplus piece (higher-value types first),
 * then a `+X` lead span if this side is the one net ahead.
 */
function buildBarChildren(surplus: Map<RawType, number>, lead: number): Element[] {
	const rawsByValueDesc = [...surplus.keys()].sort(
		(a, b) => (RAW_PIECE_VALUES[b] ?? 0) - (RAW_PIECE_VALUES[a] ?? 0),
	);

	const children: Element[] = [];
	for (const raw of rawsByValueDesc) {
		for (let i = 0; i < surplus.get(raw)!; i++) {
			const silhouette = svgcache.getCachedSilhouetteSVG(raw);
			silhouette.classList.add('material-piece');
			children.push(silhouette);
		}
	}

	if (lead > 0) {
		const span = document.createElement('span');
		span.className = 'material-lead';
		span.textContent = `+${lead}`;
		children.push(span);
	}

	return children;
}
