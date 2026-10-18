// src/client/scripts/esm/board/rendering/glyphs/boardglyphs.ts

/**
 * Renders lichess's glyph badges on the board, overhanging the top-right corner of a square: a
 * colored disc with a drop shadow, behind a white mark. Each glyph's mark and fill are defined in
 * `/svg/glyphs.svg`, composed into its shared frame, and rasterized once per context to a WebGL texture.
 */

import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type RenderContext from '../RenderContext.js';

import bdcoords from '../../../../../../shared/util/bdcoords.js';

import space from '../space.js';
import primitives from '../primitives.js';
import TextureLoader from '../../../webgl/TextureLoader.js';
import svgtoimageconverter from '../../../util/svgtoimageconverter.js';

// Types -----------------------------------------------------------------------

/** The id of a glyph in `/svg/glyphs.svg`. */
export type Glyph =
	| 'inaccuracy'
	| 'mistake'
	| 'blunder'
	| 'mate'
	| 'resign'
	| 'outoftime'
	| 'abandoned'
	| 'unknown'
	| 'draw'
	| 'stalemate';

/** A rasterized glyph, and its frame's viewBox width, which pads the centered 100-wide disc. */
type GlyphTexture = { texture: WebGLTexture; viewBoxSize: number };

/** One context's glyph textures. */
type TextureCache = {
	/** Rasterized glyph textures, built lazily. `null` marks a failed build (don't retry). */
	built: Partial<Record<Glyph, GlyphTexture | null>>;
	/** Glyphs whose texture is currently loading, to avoid duplicate builds. */
	loading: Set<Glyph>;
};

// Constants -------------------------------------------------------------------

const GLYPHS_URL = '/svg/glyphs.svg';

/** Rasterization resolution (px) of each cached glyph texture. */
const TEXTURE_SIZE = 256;

/** Disc radius, as a fraction of one square's world-space width (lila: r=50/250 square). */
const RADIUS_FRACTION = 0.2;
/** Disc center offset from the square center, as fractions of the square width (lila: local 91,8). */
const OFFSET_X_FRACTION = 0.41;
const OFFSET_Y_FRACTION = 0.42;

// State -----------------------------------------------------------------------

/** The parsed glyphs file's `<svg>` elements by id, fetched on the first glyph's build. */
let glyphSvgs: Promise<Map<string, Element>> | undefined;
/** Each context's glyph textures. Textures can't be shared across contexts. */
const textureCaches = new WeakMap<RenderContext, TextureCache>();

// Rendering -------------------------------------------------------------------

/** Renders the glyph on each of the squares. Skipped while zoomed out, where it'd be unreadable. */
function render(ctx: RenderContext, glyph: Glyph, squares: Coords[]): void {
	if (squares.length === 0 || ctx.boardpos.areZoomedOut()) return;

	const glyphTexture = getTexture(ctx, glyph);
	if (!glyphTexture) return; // Still rasterizing (or failed) — a redraw fires once it's ready.

	const boardPos = ctx.boardpos.getBoardPos();
	const boardScale = ctx.boardpos.getBoardScale();
	const scale = ctx.boardpos.getBoardScaleAsNumber();
	// Black's perspective rotates the whole board 180°, so counter-rotate the glyph to keep it at
	// the viewer's top-right corner and upright: offset toward the opposite world corner, and sample
	// the texture rotated 180° (swapped UVs).
	const viewingWhite = !ctx.camera.getIsViewingBlackPerspective();
	const offsetSign = viewingWhite ? 1 : -1;
	const [u1, v1, u2, v2] = viewingWhite ? [0, 0, 1, 1] : [1, 1, 0, 0];
	// The disc (100 viewBox units = 2·radius) occupies part of the padded viewBox; scale
	// the whole quad so the disc lands at `radius`, keeping the shadow's overhang intact.
	const halfSize = ((glyphTexture.viewBoxSize / 100) * (scale * RADIUS_FRACTION * 2)) / 2;

	const data: number[] = [];
	for (const square of squares) {
		const [centerX, centerY] = space.convertCoordToWorldSpace(
			bdcoords.fromCoords(square),
			boardPos,
			boardScale,
		);
		const x = centerX + offsetSign * scale * OFFSET_X_FRACTION;
		const y = centerY + offsetSign * scale * OFFSET_Y_FRACTION;
		// prettier-ignore
		data.push(...primitives.Quad_Texture(x - halfSize, y - halfSize, x + halfSize, y + halfSize, u1, v1, u2, v2));
	}
	ctx.renderable
		.createRenderable(data, 2, 'TRIANGLES', 'texture', false, glyphTexture.texture)
		.render();
}

// Textures --------------------------------------------------------------------

/** Returns the context's cached glyph texture, kicking off a one-time async build on first use. */
function getTexture(ctx: RenderContext, glyph: Glyph): GlyphTexture | undefined {
	let cache = textureCaches.get(ctx);
	if (cache === undefined) {
		cache = { built: {}, loading: new Set() };
		textureCaches.set(ctx, cache);
	}
	const cached = cache.built[glyph];
	if (cached !== undefined) return cached ?? undefined;
	if (cache.loading.has(glyph)) return undefined;
	cache.loading.add(glyph);
	void buildTexture(ctx, cache, glyph);
	return undefined;
}

/** Rasterizes one glyph to a WebGL texture in the context's cache, then requests a redraw. */
async function buildTexture(ctx: RenderContext, cache: TextureCache, glyph: Glyph): Promise<void> {
	try {
		const svg = composeGlyph(await getGlyphSvgs(), glyph);
		const image = await svgtoimageconverter.svgToImage(svg);
		// Normalize to a fixed power-of-two size (TextureLoader requires it, and it fixes Firefox's
		// alpha double-multiply), then upload with mipmaps for clean minification while zoomed out.
		const normalized = await svgtoimageconverter.normalizeImagePixelData(image, TEXTURE_SIZE);
		const texture = TextureLoader.loadTexture(ctx.gl, normalized, { mipmaps: true });
		cache.built[glyph] = { texture, viewBoxSize: svg.viewBox.baseVal.width };
		ctx.frames.onVisualChange(); // Draw it now that it's ready.
	} catch (e) {
		console.error(`Failed to build glyph texture for "${glyph}"`, e);
		cache.built[glyph] = null; // Give up; don't retry every frame.
	} finally {
		cache.loading.delete(glyph);
	}
}

/** Fetches and parses the glyphs file once, indexing its `<svg>` elements by id. */
function getGlyphSvgs(): Promise<Map<string, Element>> {
	glyphSvgs ??= (async (): Promise<Map<string, Element>> => {
		const response = await fetch(GLYPHS_URL);
		if (!response.ok) throw new Error(`HTTP error fetching ${GLYPHS_URL}! status: ${response.status}`); // prettier-ignore
		const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
		return new Map(Array.from(doc.getElementsByTagName('svg'), (svg) => [svg.id, svg]));
	})();
	return glyphSvgs;
}

/** Composes a glyph's standalone SVG: a copy of the frame, its disc filled, with the mark on top. */
function composeGlyph(svgs: Map<string, Element>, glyph: Glyph): SVGSVGElement {
	const frame = svgs.get('frame')?.cloneNode(true);
	const mark = svgs.get(glyph);
	const fill = mark?.getAttribute('data-fill');
	const disc = frame instanceof SVGSVGElement ? frame.querySelector('circle') : null;
	if (!(frame instanceof SVGSVGElement) || !mark || !fill || !disc)
		throw new Error(`${GLYPHS_URL} lacks the frame, or the mark and fill of "${glyph}".`);

	disc.setAttribute('fill', fill);
	frame.append(...Array.from(mark.cloneNode(true).childNodes));
	frame.id = glyph;
	return frame;
}

// Exports ---------------------------------------------------------------------

export default {
	render,
};
