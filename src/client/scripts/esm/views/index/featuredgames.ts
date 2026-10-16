// src/client/scripts/esm/views/index/featuredgames.ts

/**
 * The featured games beneath the lobby: one card per game, each a link to it showing its live
 * board between its players' bars. Keeps the cards in the server's order, routes each game's
 * updates to its board, and runs the one frame loop all the boards share.
 */

import type { VNode } from 'snabbdom';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { ClockValues } from '../../../../../shared/chess/util/clockutil.js';
import type { FeaturedGame } from '../../../../../shared/transport/clientbound.js';
import type { FeaturedBoard, FeaturedUpdate } from './featuredboard.js';

import { attributesModule, classModule, h, init } from 'snabbdom';

import gameurl from '../../../../../shared/chess/util/gameurl.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import playername from '../../../../../shared/components/playername.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';

import featuredboard from './featuredboard.js';
import frameprofiler from '../../board/frameprofiler.js';

const patch = init([attributesModule, classModule]);

// Elements --------------------------------------------------------------------

const element_section = document.getElementById('featured-games')!;

// Constants -------------------------------------------------------------------

/** The colors whose bars sit above and below each board, top first: White plays from the bottom. */
const BAR_COLORS = [players.BLACK, players.WHITE] as const;

// State -----------------------------------------------------------------------

/** The section's snabbdom tree, replaced by each patch. Starts as the empty element it renders into. */
let sectionVNode: VNode | Element = element_section;

/** The featured games, left to right, as last received. */
let games: FeaturedGame[] = [];
/** Each featured game's board, by game id. Built once its card's canvas is in the page. */
const boards = new Map<number, FeaturedBoard>();

/** The pending animation frame, while any board exists. */
let frameRequest: number | undefined;
/** Every bar's clock or score text as last drawn, to tell when the bars need redrawing. */
let barsText = '';

// Messages --------------------------------------------------------------------

/** Shows the featured games, left to right. Boards of games still featured carry on untouched. */
function onSnapshot(list: FeaturedGame[]): void {
	for (const game of list) stampFlagDeadline(game.clockValues);
	games = list;
	renderCards();
}

/** Plays an update onto its game's board. */
function onUpdate(update: FeaturedUpdate): void {
	stampFlagDeadline(update.value.clockValues);
	const board = boards.get(update.value.id);
	// An update sent before we unsubscribed can still arrive after the boards were cleared.
	if (board === undefined) return;
	featuredboard.apply(board, update);
}

/** Removes every featured game, as when the lobby unsubscribes or the socket closes. */
function clear(): void {
	onSnapshot([]);
}

/** Stamps the clocks' flag deadline at receipt. Display-only, so not adjusted for ping. */
function stampFlagDeadline(clockValues: ClockValues | undefined): void {
	if (clockValues !== undefined) clockutil.stampFlagDeadline(clockValues, 0);
}

// Boards ----------------------------------------------------------------------

/** Builds a game's board once its canvas is in the page, and starts the frame loop if it isn't running. */
function onCanvasInserted(game: FeaturedGame, canvas: HTMLCanvasElement): void {
	try {
		boards.set(game.id, featuredboard.create(canvas, game));
	} catch (error) {
		// No WebGL2: the card keeps its bars. Thrown out of this hook, it would abort the patch.
		console.error(error);
		return;
	}
	frameRequest ??= requestAnimationFrame(onFrame);
}

/** Disposes of a game's board once its card leaves the page. */
function onCanvasDestroyed(id: number): void {
	const board = boards.get(id);
	if (board === undefined) return; // Never built: no WebGL2
	featuredboard.dispose(board);
	boards.delete(id);
}

/** Advances and draws every board, then redraws the bars if any clock or score changed. */
function onFrame(runtime: number): void {
	frameRequest = undefined;
	if (boards.size === 0) return; // Every card is gone: the loop stops until a new one arrives.

	frameprofiler.update(runtime);
	for (const board of boards.values()) {
		featuredboard.update(board);
		featuredboard.render(board);
	}
	if (getBarsText() !== barsText) renderCards();

	frameRequest = requestAnimationFrame(onFrame);
}

/** Every bar's clock or score text, joined, in card order. */
function getBarsText(): string {
	return games
		.flatMap((game) => BAR_COLORS.map((color) => getClockOrScore(game, color) ?? ''))
		.join('|');
}

/** A bar's clock or score text, once its board has loaded. */
function getClockOrScore(game: FeaturedGame, color: Player): string | undefined {
	const board = boards.get(game.id);
	return board && featuredboard.getClockOrScore(board, color);
}

// Rendering -------------------------------------------------------------------

/** Patches the section with a card per featured game, hiding it while there are none. */
function renderCards(): void {
	sectionVNode = patch(
		sectionVNode,
		h(
			'section#featured-games.featured-games',
			{ class: { hidden: games.length === 0 } },
			games.map((game) => createCardVNode(game)),
		),
	);
	barsText = getBarsText();
}

/** One game's card: a link to it, with its board between its players' bars. */
function createCardVNode(game: FeaturedGame): VNode {
	return h('a.featured-card', { key: game.id, attrs: { href: gameurl.getGameUrl(game.id) } }, [
		createBarVNode(game, BAR_COLORS[0]),
		h('canvas.featured-board.visibility-hidden', {
			hook: {
				insert: (vnode) => onCanvasInserted(game, vnode.elm as HTMLCanvasElement),
				destroy: () => onCanvasDestroyed(game.id),
			},
		}),
		createBarVNode(game, BAR_COLORS[1]),
	]);
}

/** One player's bar: their name, their rating if a member, and their clock or score. */
function createBarVNode(game: FeaturedGame, color: Player): VNode {
	const participant = game.players[color]!; // Every featured game has both seats
	const rating = participant.type === 'player' ? participant.rating : undefined;
	const clockOrScore = getClockOrScore(game, color);
	return h('div.featured-bar', [
		h('span.username-embed', [
			h('span.username', playername.resolve(participant, false, t.shared)),
			...(rating ? [h('span.elo', metadatautil.getFormattedElo(rating))] : []),
		]),
		...(clockOrScore !== undefined ? [h('span.featured-clock', clockOrScore)] : []),
	]);
}

// Exports ---------------------------------------------------------------------

export default {
	onSnapshot,
	onUpdate,
	clear,
};
