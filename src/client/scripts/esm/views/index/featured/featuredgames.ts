// src/client/scripts/esm/views/index/featured/featuredgames.ts

/**
 * The featured games beneath the lobby: one card per game, each a link to it showing its live
 * board between its players' bars. Keeps the cards in the server's order, hands a replaced game's
 * card to its replacement, routes each game's updates to its board, and runs the one frame loop
 * all the boards share.
 */

import type { VNode } from 'snabbdom';
import type { Player } from '../../../../../../shared/chess/util/typeutil.js';
import type { ClockValues } from '../../../../../../shared/chess/util/clockutil.js';
import type { FeaturedGame } from '../../../../../../shared/transport/clientbound.js';
import type { FeaturedBoard, FeaturedUpdate } from './featuredboard.js';

import { attributesModule, classModule, h, init } from 'snabbdom';

import gameurl from '../../../../../../shared/chess/util/gameurl.js';
import clockutil from '../../../../../../shared/chess/util/clockutil.js';
import playername from '../../../../../../shared/components/playername.js';
import { players } from '../../../../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../../../../shared/chess/util/metadatautil.js';

import featuredboard from './featuredboard.js';
import frameprofiler from '../../../board/frameprofiler.js';

const patch = init([attributesModule, classModule]);

// Types -----------------------------------------------------------------------

/** One card: a featured game, under a key that keeps its element and board across replacements. */
interface Card {
	key: number;
	/** The latest game received for its slot. Shown once its board has loaded it. */
	game: FeaturedGame;
}

// Elements --------------------------------------------------------------------

const element_section = document.getElementById('featured-games')!;

// Constants -------------------------------------------------------------------

/** The colors whose bars sit above and below each board, top first: White plays from the bottom. */
const BAR_COLORS = [players.BLACK, players.WHITE] as const;

// State -----------------------------------------------------------------------

/** The section's snabbdom tree, replaced by each patch. Starts as the empty element it renders into. */
let sectionVNode: VNode | Element = element_section;

/** A card per featured game, left to right, as last received. */
let cards: Card[] = [];
/** The key the next new card takes. */
let nextKey = 0;
/** Each card's board, by card key. Built once its canvas is in the page. */
const boards = new Map<number, FeaturedBoard>();

/** The pending animation frame, while any board exists. */
let frameRequest: number | undefined;
/** The {@link getCardsSignature} as last drawn, to tell when the cards need redrawing. */
let cardsSignature = '';

// Messages --------------------------------------------------------------------

/** Shows the featured games as their list changes. Boards of games still featured carry on. */
function onSnapshot(list: FeaturedGame[]): void {
	setCards(list, false);
}

/**
 * Shows the featured games sent as the lobby (re)subscribes. Boards of games still featured
 * reload theirs in place, as they may have missed updates while the socket was down.
 */
function onSubscribed(list: FeaturedGame[]): void {
	setCards(list, true);
}

/**
 * Shows the featured games, left to right. The server replaces a game in its exact slot, so a new
 * game at the index of one that left takes over its card, whose board loads it while still
 * drawing the old.
 * @param reloadKept - Whether boards keeping their game reload it too, in case they're behind the list.
 */
function setCards(list: FeaturedGame[], reloadKept: boolean): void {
	for (const game of list) stampFlagDeadline(game.clockValues);
	const previous = cards;
	cards = list.map((game, i) => {
		const kept = previous.find((c) => c.game.id === game.id);
		if (kept !== undefined) {
			if (reloadKept) loadOnto(kept.key, game);
			return { key: kept.key, game };
		}
		const replaced = previous[i];
		if (replaced === undefined || list.some((g) => g.id === replaced.game.id)) {
			return { key: nextKey++, game };
		}
		loadOnto(replaced.key, game);
		return { key: replaced.key, game };
	});
	renderCards();
}

/** Loads a game onto a card's board, which keeps drawing its current one until it's done. */
function loadOnto(key: number, game: FeaturedGame): void {
	const board = boards.get(key);
	if (board !== undefined) void featuredboard.load(board, game); // Never built: no WebGL2
}

/** Plays an update onto its game's board. */
function onUpdate(update: FeaturedUpdate): void {
	stampFlagDeadline(update.value.clockValues);
	const card = cards.find((c) => c.game.id === update.value.id);
	// An update sent before we unsubscribed can still arrive after the cards were cleared.
	const board = card && boards.get(card.key);
	if (board === undefined) return;
	featuredboard.apply(board, update);
}

/** Removes every featured game, as when the lobby unsubscribes or the connection is lost. */
function clear(): void {
	setCards([], false);
}

/** Stamps the clocks' flag deadline at receipt. Display-only, so not adjusted for ping. */
function stampFlagDeadline(clockValues: ClockValues | undefined): void {
	if (clockValues !== undefined) clockutil.stampFlagDeadline(clockValues, 0);
}

// Boards ----------------------------------------------------------------------

/** Builds a card's board once its canvas is in the page, and starts the frame loop if it isn't running. */
function onCanvasInserted(card: Card, canvas: HTMLCanvasElement): void {
	try {
		boards.set(card.key, featuredboard.create(canvas, card.game));
	} catch (error) {
		// No WebGL2: the card keeps its bars. Thrown out of this hook, it would abort the patch.
		console.error(error);
		return;
	}
	frameRequest ??= requestAnimationFrame(onFrame);
}

/** Disposes of a card's board once the card leaves the page. */
function onCanvasDestroyed(key: number): void {
	const board = boards.get(key);
	if (board === undefined) return; // Never built: no WebGL2
	featuredboard.dispose(board);
	boards.delete(key);
}

/**
 * Advances and draws every board, then redraws the cards if any switched game, or any clock,
 * score or player on the move changed. A board's switch thus reaches its card in the same frame.
 */
function onFrame(runtime: number): void {
	frameRequest = undefined;
	if (boards.size === 0) return; // Every card is gone: the loop stops until a new one arrives.

	frameprofiler.update(runtime);
	for (const board of boards.values()) {
		featuredboard.update(board);
		featuredboard.render(board);
	}
	if (getCardsSignature() !== cardsSignature) renderCards();

	frameRequest = requestAnimationFrame(onFrame);
}

/** Every card's shown game id, bars' clock or score text and player on the move, in card order. */
function getCardsSignature(): string {
	return cards
		.flatMap((card) => [
			getShownGame(card).id,
			...BAR_COLORS.map((color) => getClockOrScore(card, color) ?? ''),
			getPlayerOnTheMove(card) ?? '',
		])
		.join('|');
}

/** The game a card shows: its board's once one has loaded, else the latest received. */
function getShownGame(card: Card): FeaturedGame {
	const board = boards.get(card.key);
	return (board && featuredboard.getShownGame(board)) ?? card.game;
}

/** A bar's clock or score text, of the game its card's board draws. */
function getClockOrScore(card: Card, color: Player): string | undefined {
	const board = boards.get(card.key);
	return board && featuredboard.getClockOrScore(board, color);
}

/** The player on the move, in the game its card's board draws. */
function getPlayerOnTheMove(card: Card): Player | undefined {
	const board = boards.get(card.key);
	return board && featuredboard.getPlayerOnTheMove(board);
}

// Rendering -------------------------------------------------------------------

/** Patches the section with its cards, hiding it while there are none. */
function renderCards(): void {
	sectionVNode = patch(
		sectionVNode,
		h(
			'section#featured-games.featured-games',
			{ class: { hidden: cards.length === 0 } },
			cards.map((card) => createCardVNode(card)),
		),
	);
	cardsSignature = getCardsSignature();
}

/** One card: a link to the game it shows, with its board between its players' bars. */
function createCardVNode(card: Card): VNode {
	const { key } = card;
	const game = getShownGame(card);
	return h('a.featured-card', { key, attrs: { href: gameurl.getGameUrl(game.id) } }, [
		createBarVNode(card, game, BAR_COLORS[0]),
		h('canvas.featured-board.visibility-hidden', {
			hook: {
				insert: (vnode) => onCanvasInserted(card, vnode.elm as HTMLCanvasElement),
				destroy: () => onCanvasDestroyed(key),
			},
		}),
		createBarVNode(card, game, BAR_COLORS[1]),
	]);
}

/**
 * One player's bar: their name, their rating if a member, and their clock or score.
 * @param game - The game its card shows.
 */
function createBarVNode(card: Card, game: FeaturedGame, color: Player): VNode {
	const participant = game.players[color]!; // Every featured game has both seats
	const rating = participant.type === 'player' ? participant.rating : undefined;
	const clock = createClockVNode(card, game, color);
	return h('div.featured-bar', [
		h('span.username-embed', [
			h('span.username', playername.resolve(participant, false, t.shared)),
			...(rating ? [h('span.elo', metadatautil.getFormattedElo(rating))] : []),
		]),
		...(clock ? [clock] : []),
	]);
}

/**
 * A bar's clock or score, or the infinity icon standing in for an untimed game's clock,
 * marked while its player is on the move.
 */
function createClockVNode(card: Card, game: FeaturedGame, color: Player): VNode | null {
	const data = { class: { tempo: getPlayerOnTheMove(card) === color } };
	const clockOrScore = getClockOrScore(card, color);
	if (clockOrScore !== undefined) return h('span.featured-clock', data, clockOrScore);
	if (!clockutil.isClockValueInfinite(game.timeControl)) return null; // Its board hasn't loaded yet
	const icon = clockutil.getSpeedIconId(game.timeControl);
	return h('svg.meta-icon.featured-clock', data, [h('use', { attrs: { href: `#${icon}` } })]);
}

// Exports ---------------------------------------------------------------------

export default {
	onSnapshot,
	onSubscribed,
	onUpdate,
	clear,
};
