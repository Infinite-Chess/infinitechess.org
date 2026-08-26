// src/server/config/pieceSvgCache.ts

/**
 * Preloads every chess piece's SVG markup from the built client assets, so pages can SSR
 * piece icons inline. The server-side counterpart to the client's svgcache, which fetches
 * these very same files over HTTP — the difference being what each side needs: the client
 * builds live SVGElements to tint and rasterize, this hands out flat markup.
 *
 * Only the black variant of each piece is kept: pages inline these as monochrome
 * silhouettes, recolored by CSS, so no tint or other player color is ever wanted.
 */

import type { RawType } from '../../shared/util/typeutil.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import piecethemes from '../../shared/chess/util/piecethemes.js';
import typeutil, { players, rawTypes } from '../../shared/util/typeutil.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Constants -------------------------------------------------------------------

/** The built client's piece SVG folder — the very files the client fetches at runtime. */
const PIECE_SVG_FOLDER = path.join(__dirname, '../../client/svg/pieces');

/**
 * Matches one whole `<svg>` element, capturing its opening attributes and its inner markup.
 * The piece files are flat lists of sibling `<svg>`s, which the lazy body relies on — a nested
 * `<svg>` would silently truncate it, so {@link loadPieceSVGs} rejects any file that has one.
 */
const SVG_ELEMENT_REGEX = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/g;

/**
 * Matches an `<svg>`'s own `id` attribute, capturing its value. Anchored to the space
 * before it so it can never latch onto the tail of another name, like `data-id="..."`.
 */
const ID_ATTRIBUTE_REGEX = /\sid="([^"]*)"/;

// State -----------------------------------------------------------------------

/** Each raw type's black-variant SVG markup, with the source file's `id` stripped. */
const pieceSVGs: Map<RawType, string> = loadPieceSVGs();

// Functions -------------------------------------------------------------------

/**
 * Reads every piece SVG file. Every page that renders a piece wants these, so
 * they are read once on import rather than waiting on a call from startup.
 * @throws If a file is missing, breaks the flat `<svg id="...">` shape, or lacks a piece's
 *   black or neutral variant — failing the boot instead of corrupting a page later.
 */
function loadPieceSVGs(): Map<RawType, string> {
	const pieceSVGs = new Map<RawType, string>();
	/** Every piece SVG across all the files, keyed by its source id (e.g. `"pawn-black"`). */
	const svgsById = new Map<string, string>();

	const allRawTypes = Object.values(rawTypes);

	for (const location of piecethemes.getLocationsForTypes(allRawTypes)) {
		const file = fs.readFileSync(path.join(PIECE_SVG_FOLDER, `${location}.svg`), 'utf8');

		// Reading fewer elements than there are opening tags means one of them is nested or
		// self-closing, either of which puts the reader out of step with the rest of the file.
		const elements = [...file.matchAll(SVG_ELEMENT_REGEX)];
		if (elements.length !== (file.match(/<svg\b/g)?.length ?? 0)) {
			throw new Error(`Piece svg file "${location}.svg" nests or self-closes an <svg>.`);
		}

		for (const [, attributes, inner] of elements) {
			// An odd number of quotes means a ">" inside an attribute value ended the opening
			// tag early, truncating the attributes. Caught here so it can't corrupt silently.
			if ((attributes!.match(/"/g)?.length ?? 0) % 2 !== 0) throw new Error(`An <svg> in piece svg file "${location}.svg" has a ">" inside an attribute value.`); // prettier-ignore

			const id = attributes!.match(ID_ATTRIBUTE_REGEX)?.[1];
			if (id === undefined) throw new Error(`An <svg> in piece svg file "${location}.svg" has no id.`); // prettier-ignore
			// Drop the id — these are inlined into pages, where a repeated id is invalid HTML.
			svgsById.set(id, `<svg${attributes!.replace(ID_ATTRIBUTE_REGEX, '')}>${inner}</svg>`);
		}
	}

	for (const rawType of allRawTypes) {
		if (piecethemes.getLocationForType(rawType) === null) continue; // Has no svg (VOID)
		const baseId = typeutil.getRawTypeStr(rawType);
		const markup = piecethemes
			.getSVGColorPriority(players.BLACK)
			.map((ext) => svgsById.get(baseId + ext))
			.find((found) => found !== undefined);
		if (markup === undefined) throw new Error(`No black or neutral svg found for piece "${baseId}".`); // prettier-ignore
		pieceSVGs.set(rawType, markup);
	}

	return pieceSVGs;
}

/**
 * Returns a piece's black-variant `<svg>` markup, ready to inline into a page.
 * Its own fills and strokes are left untouched, for the page's CSS to override.
 * @throws If the piece has no svg of its own (VOID).
 */
function get(rawType: RawType): string {
	const markup = pieceSVGs.get(rawType);
	if (markup === undefined) {
		throw new Error(`Piece "${typeutil.getRawTypeStr(rawType)}" has no svg.`);
	}
	return markup;
}

// Exports ---------------------------------------------------------------------

export default { get };
