// src/client/scripts/esm/game/gui/guimaterial.ts

/**
 * Manages the two `.material` captured-material bars on the game page: the bottom
 * bar (our POV, or white for spectators) and the top bar (the opponent, or black).
 *
 * Each bar shows only its side's *surplus* silhouettes after canceling like piece
 * types against the other side, plus a `+X` estimated point lead on the side that's
 * net ahead. Recomputed on every `view-move` so rewinding reflects the material at
 * that point in time. Disabled entirely for games whose starting position is
 * unbalanced (either side starts with an unequal count of any piece type).
 */

import type { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';
import type { Player, RawType } from '../../../../../shared/chess/util/typeutil.js';

import boardutil from '../../../../../shared/chess/util/boardutil.js';
import typeutil, { rawTypes, players as p } from '../../../../../shared/chess/util/typeutil.js';

import gameslot from '../chess/gameslot.js';
import svgcache from '../../chess/rendering/svgcache.js';
import { GameBus } from '../GameBus.js';
import { createRenderQueue } from '../../util/renderqueue.js';

// Point values --------------------------------------------------------------------------------

/**
 * Estimated point value of each raw piece type, used only to compute the `+X` lead
 * shown on the net-ahead side. Types absent here (royals, neutrals) count as 0.
 */
const RAW_PIECE_VALUES: Partial<Record<RawType, number>> = {
	[rawTypes.PAWN]: 1,
	[rawTypes.KNIGHT]: 3,
	[rawTypes.GUARD]: 3,
	[rawTypes.KING]: 3,
	[rawTypes.BISHOP]: 5,
	[rawTypes.ROOK]: 7,
	[rawTypes.ARCHBISHOP]: 9,
	[rawTypes.CHANCELLOR]: 11,
	[rawTypes.QUEEN]: 15,
	[rawTypes.ROYALQUEEN]: 15,
	// Fairy pieces
	[rawTypes.CAMEL]: 4,
	[rawTypes.ZEBRA]: 4,
	[rawTypes.GIRAFFE]: 4,
	[rawTypes.HAWK]: 7,
	[rawTypes.CENTAUR]: 7,
	[rawTypes.ROYALCENTAUR]: 7,
	[rawTypes.HUYGEN]: 7,
	[rawTypes.KNIGHTRIDER]: 9,
	[rawTypes.ROSE]: 9,
	[rawTypes.AMAZON]: 19,
};

// Elements ------------------------------------------------------------------------------------

const element_MaterialTop = document.getElementById('material-top')!;
const element_MaterialBottom = document.getElementById('material-bottom')!;

// Variables -----------------------------------------------------------------------------------

/**
 * Whether the loaded game's starting position is balanced (all sides start with an equal count
 * of every piece type, and only white & black are present). Material bars are disabled otherwise
 * Computed on `game-loaded`.
 */
let balanced = false;

/**
 * Serializes bar-render operations, preserving order across the async silhouette fetches each
 * render awaits — overlapping `view-move` updates would otherwise interleave and race.
 */
const enqueueRender = createRenderQueue('Material bar render error');

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
async function render(): Promise<void> {
	element_MaterialTop.replaceChildren();
	element_MaterialBottom.replaceChildren();
	if (!balanced) return;

	const { white, black, pointLead } = computeSurplus();

	// Map each side to its bar by perspective: bottom = our POV (or white for spectators).
	const bottomPlayer: Player = gameslot.areViewingWhite() ? p.WHITE : p.BLACK;
	const surplusOf = (player: Player): Map<RawType, number> =>
		player === p.WHITE ? white : black;
	const leadOf = (player: Player): number => (player === p.WHITE ? pointLead : -pointLead);

	const topPlayer: Player = bottomPlayer === p.WHITE ? p.BLACK : p.WHITE;
	await fillBar(element_MaterialBottom, surplusOf(bottomPlayer), leadOf(bottomPlayer));
	await fillBar(element_MaterialTop, surplusOf(topPlayer), leadOf(topPlayer));
}

/**
 * Populates one bar: a silhouette per surplus piece (higher-value types first),
 * then a `+X` lead span if this side is the one net ahead.
 */
async function fillBar(
	bar: HTMLElement,
	surplus: Map<RawType, number>,
	lead: number,
): Promise<void> {
	const rawsByValueDesc = [...surplus.keys()].sort(
		(a, b) => (RAW_PIECE_VALUES[b] ?? 0) - (RAW_PIECE_VALUES[a] ?? 0),
	);
	for (const raw of rawsByValueDesc) {
		for (let i = 0; i < surplus.get(raw)!; i++) {
			const silhouette = await svgcache.getSilhouetteSVG(raw);
			silhouette.classList.add('material-piece');
			bar.appendChild(silhouette);
		}
	}

	if (lead > 0) {
		const span = document.createElement('span');
		span.className = 'material-lead';
		span.textContent = `+${lead}`;
		bar.appendChild(span);
	}
}

// Events --------------------------------------------------------------------------------------

// Recompute `balance` from the freshly-loaded start position, then render the current material.
GameBus.addEventListener('game-loaded', () => {
	const gamefile = gameslot.getGamefile()!;
	balanced = isStartPositionBalanced(gamefile.startSnapshot.position);
	enqueueRender(render);
});
// Rewinding/forwarding restores the board to the viewed move, so the live counts already reflect it.
GameBus.addEventListener('view-move', () => enqueueRender(render));
