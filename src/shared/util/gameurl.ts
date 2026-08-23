// src/shared/util/gameurl.ts

/**
 * The `/game/:id/:color?` and `/analysis/:id/:color?` page URLs, built and parsed in one place.
 *
 * The optional trailing color segment is a board-perspective override: it decides which side
 * the board is viewed from, taking priority over the viewer's own role in the game.
 */

import type { Player } from './typeutil.js';

import uuid from './uuid.js';
import { players as p } from './typeutil.js';

/** A perspective override as it appears in a URL. Only two sides are expressible. */
type ViewColorCode = 'w' | 'b';

/** The URL segment for viewing the board from `viewColor`'s side. */
function getViewColorCode(viewColor: Player): ViewColorCode {
	if (viewColor === p.WHITE) return 'w';
	if (viewColor === p.BLACK) return 'b';
	throw new Error(`Player ${viewColor} is not a perspective a URL can express.`);
}

/**
 * Resolves a URL's color segment to the perspective it overrides to,
 * or undefined if absent (the viewer's own role decides instead).
 * @param segment - The raw `:color` route param.
 */
function parseViewColorCode(segment: string | undefined): Player | undefined {
	if (segment === 'w') return p.WHITE;
	if (segment === 'b') return p.BLACK;
	return undefined;
}

/**
 * Builds the `/game/:id` URL.
 * @param id - The numeric game id (encoded into the base62 URL).
 * @param viewColor - The side to view the board from. Omit to view from the viewer's own.
 */
function getGameUrl(id: number, viewColor?: Player): string {
	return `/game/${uuid.base10ToBase62(id)}${getViewColorSegment(viewColor)}`;
}

/** Builds the absolute `/game/:id` URL. Carries no perspective. */
function getAbsoluteGameUrl(id: number): string {
	return `https://www.infinitechess.org${getGameUrl(id)}`;
}

/**
 * Builds the `/analysis/:id` URL.
 * @param id - The numeric game id (encoded into the base62 URL).
 * @param viewColor - The side to view the board from. Omit to view from the viewer's own.
 */
function getAnalysisUrl(id: number, viewColor?: Player): string {
	return `/analysis/${uuid.base10ToBase62(id)}${getViewColorSegment(viewColor)}`;
}

/** The trailing `/w` or `/b` segment, or nothing if no perspective is being overridden. */
function getViewColorSegment(viewColor: Player | undefined): string {
	return viewColor !== undefined ? `/${getViewColorCode(viewColor)}` : '';
}

export default {
	parseViewColorCode,
	getGameUrl,
	getAbsoluteGameUrl,
	getAnalysisUrl,
};
