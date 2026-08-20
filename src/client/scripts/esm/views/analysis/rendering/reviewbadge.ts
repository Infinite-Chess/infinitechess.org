// src/client/scripts/esm/views/analysis/rendering/reviewbadge.ts

/**
 * Renders the Game Review classification badge (e.g. "?!", "?", "??") on the
 * board, overhanging the top-right corner of the currently-viewed move's
 * destination square — matching lichess exactly.
 *
 * The glyphs are lila's own hand-authored SVG paths (see `lila/ui/lib/src/game/glyphs.ts`),
 * rasterized once per classification to a WebGL texture: a colored circle with lila's
 * `feDropShadow` and a bold white glyph. Circle fills come from our `--review-*` vars — always
 * the dark-theme values, since the board tiles the badges sit on don't change with the page's
 * light/dark theme.
 */

import type { LapseKey } from '../gamereview.js';

import bdcoords from '../../../../../../shared/chess/util/bdcoords.js';

import space from '../../../board/space.js';
import { gl } from '../../../board/rendering/webgl.js';
import boardpos from '../../../board/rendering/boardpos.js';
import gameslot from '../../../game/chess/gameslot.js';
import movetree from '../movetree.js';
import primitives from '../../../board/rendering/primitives.js';
import gamereview from '../gamereview.js';
import { GameBus } from '../../../board/GameBus.js';
import frametracker from '../../../board/rendering/frametracker.js';
import TextureLoader from '../../../webgl/TextureLoader.js';
import svgtoimageconverter from '../../../util/svgtoimageconverter.js';
import { createRenderable } from '../../../webgl/Renderable.js';

// Constants -----------------------------------------------------------------

/**
 * lila's exact white glyph paths, authored in the same 0–100 coordinate space as the
 * circle (`cx=50 cy=50 r=50`). Verbatim from `lila/ui/lib/src/game/glyphs.ts`.
 */
const GLYPH_PATHS: Record<LapseKey, string> = {
	inaccuracy:
		'M37.734 21.947c-3.714 0-7.128.464-10.242 1.393-3.113.928-6.009 2.13-8.685 3.605l4.343 8.766c2.35-1.202 4.644-2.157 6.883-2.867a22.366 22.366 0 0 1 6.799-1.065c2.294 0 4.07.464 5.326 1.393 1.311.874 1.967 2.186 1.967 3.933 0 1.748-.546 3.277-1.639 4.588-1.038 1.257-2.786 2.758-5.244 4.506-2.786 2.021-4.751 3.961-5.898 5.819-1.147 1.857-1.721 4.15-1.721 6.88v2.952h10.568v-2.377c0-1.147.137-2.103.41-2.868.328-.764.93-1.557 1.803-2.376.874-.82 2.104-1.803 3.688-2.95 2.13-1.584 3.906-3.058 5.326-4.424 1.42-1.42 2.485-2.95 3.195-4.59.71-1.638 1.065-3.576 1.065-5.816 0-4.206-1.584-7.675-4.752-10.406-3.114-2.731-7.51-4.096-13.192-4.096zm24.745.819 2.048 39.084h9.75l2.047-39.084zM35.357 68.73c-1.966 0-3.632.52-4.998 1.557-1.365.983-2.047 2.732-2.047 5.244 0 2.404.682 4.152 2.047 5.244 1.366 1.038 3.032 1.557 4.998 1.557 1.912 0 3.55-.519 4.916-1.557 1.366-1.092 2.05-2.84 2.05-5.244 0-2.512-.684-4.26-2.05-5.244-1.365-1.038-3.004-1.557-4.916-1.557zm34.004 0c-1.966 0-3.632.52-4.998 1.557-1.365.983-2.049 2.732-2.049 5.244 0 2.404.684 4.152 2.05 5.244 1.365 1.038 3.03 1.557 4.997 1.557 1.912 0 3.55-.519 4.916-1.557 1.366-1.092 2.047-2.84 2.047-5.244 0-2.512-.681-4.26-2.047-5.244-1.365-1.038-3.004-1.557-4.916-1.557z',
	mistake:
		'M40.436 60.851q0-4.66 1.957-7.83 1.958-3.17 6.712-6.619 4.195-2.983 5.967-5.127 1.864-2.237 1.864-5.22 0-2.983-2.237-4.475-2.144-1.585-6.06-1.585-3.915 0-7.737 1.212t-7.83 3.263l-4.941-9.975q4.568-2.517 9.881-4.101 5.314-1.585 11.653-1.585 9.695 0 15.008 4.661 5.407 4.661 5.407 11.839 0 3.822-1.212 6.619-1.212 2.796-3.635 5.22-2.424 2.33-6.06 5.034-2.703 1.958-4.195 3.356-1.491 1.398-2.05 2.703-.467 1.305-.467 3.263v2.703H40.436zm-1.492 18.924q0-4.288 2.33-5.966 2.331-1.771 5.687-1.771 3.263 0 5.594 1.771 2.33 1.678 2.33 5.966 0 4.102-2.33 5.966-2.331 1.772-5.594 1.772-3.356 0-5.686-1.772-2.33-1.864-2.33-5.966z',
	blunder:
		'M31.8 22.22c-3.675 0-7.052.46-10.132 1.38-3.08.918-5.945 2.106-8.593 3.565l4.298 8.674c2.323-1.189 4.592-2.136 6.808-2.838a22.138 22.138 0 0 1 6.728-1.053c2.27 0 4.025.46 5.268 1.378 1.297.865 1.946 2.16 1.946 3.89s-.541 3.242-1.622 4.539c-1.027 1.243-2.756 2.73-5.188 4.458-2.756 2-4.7 3.918-5.836 5.755-1.134 1.837-1.702 4.107-1.702 6.808v2.92h10.457v-2.35c0-1.135.135-2.082.406-2.839.324-.756.918-1.54 1.783-2.35.864-.81 2.079-1.784 3.646-2.918 2.107-1.568 3.863-3.026 5.268-4.376 1.405-1.405 2.46-2.92 3.162-4.541.703-1.621 1.054-3.54 1.054-5.755 0-4.161-1.568-7.592-4.702-10.294-3.08-2.702-7.43-4.052-13.05-4.052zm38.664 0c-3.675 0-7.053.46-10.133 1.38-3.08.918-5.944 2.106-8.591 3.565l4.295 8.674c2.324-1.189 4.593-2.136 6.808-2.838a22.138 22.138 0 0 1 6.728-1.053c2.27 0 4.026.46 5.269 1.378 1.297.865 1.946 2.16 1.946 3.89s-.54 3.242-1.62 4.539c-1.027 1.243-2.757 2.73-5.189 4.458-2.756 2-4.7 3.918-5.835 5.755-1.135 1.837-1.703 4.107-1.703 6.808v2.92h10.457v-2.35c0-1.135.134-2.082.404-2.839.324-.756.918-1.54 1.783-2.35.865-.81 2.081-1.784 3.648-2.918 2.108-1.568 3.864-3.026 5.269-4.376 1.405-1.405 2.46-2.92 3.162-4.541.702-1.621 1.053-3.54 1.053-5.755 0-4.161-1.567-7.592-4.702-10.294-3.08-2.702-7.43-4.052-13.05-4.052zM29.449 68.504c-1.945 0-3.593.513-4.944 1.54-1.351.973-2.027 2.703-2.027 5.188 0 2.378.676 4.108 2.027 5.188 1.35 1.027 3 1.54 4.944 1.54 1.892 0 3.512-.513 4.863-1.54 1.35-1.08 2.026-2.81 2.026-5.188 0-2.485-.675-4.215-2.026-5.188-1.351-1.027-2.971-1.54-4.863-1.54zm38.663 0c-1.945 0-3.592.513-4.943 1.54-1.35.973-2.026 2.703-2.026 5.188 0 2.378.675 4.108 2.026 5.188 1.351 1.027 2.998 1.54 4.943 1.54 1.891 0 3.513-.513 4.864-1.54 1.351-1.08 2.027-2.81 2.027-5.188 0-2.485-.676-4.215-2.027-5.188-1.35-1.027-2.973-1.54-4.864-1.54z',
};

/** The circle spans [0,100]; the viewBox is padded so the drop shadow isn't clipped. */
const VIEWBOX_MIN = -25;
const VIEWBOX_SIZE = 150;
/** Rasterization resolution (px) of each cached badge texture. */
const TEXTURE_SIZE = 256;

/** Badge circle radius, as a fraction of one square's world-space width (lila: r=50/250 square). */
const RADIUS_FRACTION = 0.2;
/** Badge center offset from the square center, as fractions of the square width (lila: local 91,8). */
const OFFSET_X_FRACTION = 0.41;
const OFFSET_Y_FRACTION = 0.42;

// State -----------------------------------------------------------------------------

/** Rasterized badge textures, built lazily per classification. `null` marks a failed build (don't retry). */
const textureCache: Partial<Record<LapseKey, WebGLTexture | null>> = {};
/** Classifications whose texture is currently loading, to avoid duplicate builds. */
const loading = new Set<LapseKey>();

// Init ------------------------------------------------------------------------------

GameBus.addEventListener('render-above-pieces', render);

// The engine classifies moves asynchronously; if it lands on the move the user is
// currently viewing, force a redraw so the badge doesn't wait for an unrelated one.
gamereview.onClassified((review) => {
	const gamefile = gameslot.getGamefile();
	if (gamefile && movetree.getCurrentNode(gamefile)?.id === review.nodeId)
		frametracker.onVisualChange();
});

// Functions -------------------------------------------------------------------------

/** Renders the classification badge on the currently-viewed move, if it has one. */
function render(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	const node = movetree.getCurrentNode(gamefile);
	if (!node?.move) return; // Root (starting position) has no move to badge.

	const review = gamereview.getReviewForNode(node.id);
	if (!review?.classification || !gamereview.isLapseKey(review.classification)) return;
	const classification = review.classification;

	const texture = getBadgeTexture(classification);
	if (!texture) return; // Still rasterizing (or failed) — a redraw fires once it's ready.

	if (boardpos.areZoomedOut()) return; // Too zoomed out to see badges

	const scale = boardpos.getBoardScaleAsNumber();
	const [centerX, centerY] = space.convertCoordToWorldSpace(
		bdcoords.FromCoords(node.move.endCoords),
	);

	// Black's perspective rotates the whole board 180°, so counter-rotate the badge to keep it at
	// the viewer's top-right corner and upright: offset toward the opposite world corner, and sample
	// the texture rotated 180° (swapped UVs).
	const viewingWhite = gameslot.areViewingWhite();
	const offsetSign = viewingWhite ? 1 : -1;
	const badgeX = centerX + offsetSign * scale * OFFSET_X_FRACTION;
	const badgeY = centerY + offsetSign * scale * OFFSET_Y_FRACTION;
	const [u1, v1, u2, v2] = viewingWhite ? [0, 0, 1, 1] : [1, 1, 0, 0];

	// The circle (100 viewBox units = 2·radius) occupies part of the padded viewBox; scale
	// the whole quad so the circle lands at `radius`, keeping the shadow's overhang intact.
	const halfSize = ((VIEWBOX_SIZE / 100) * (scale * RADIUS_FRACTION * 2)) / 2;
	const data = primitives.Quad_Texture(
		badgeX - halfSize,
		badgeY - halfSize,
		badgeX + halfSize,
		badgeY + halfSize,
		u1,
		v1,
		u2,
		v2,
	);
	createRenderable(data, 2, 'TRIANGLES', 'texture', false, texture).render();
}

/** Returns the cached badge texture, kicking off a one-time async build on first use. */
function getBadgeTexture(classification: LapseKey): WebGLTexture | undefined {
	const cached = textureCache[classification];
	if (cached !== undefined) return cached ?? undefined;
	if (loading.has(classification)) return undefined;
	loading.add(classification);
	void buildBadgeTexture(classification);
	return undefined;
}

/** Rasterizes one classification's badge SVG to a cached WebGL texture, then requests a redraw. */
async function buildBadgeTexture(classification: LapseKey): Promise<void> {
	try {
		const fill = getDarkThemeReviewColor(classification);
		const svg = buildBadgeSvg(fill, GLYPH_PATHS[classification]);
		const image = await svgtoimageconverter.svgStringToImage(svg);
		// Normalize to a fixed power-of-two size (TextureLoader requires it, and it fixes Firefox's
		// alpha double-multiply), then upload with mipmaps for clean minification while zoomed out.
		const normalized = await svgtoimageconverter.normalizeImagePixelData(image, TEXTURE_SIZE);
		textureCache[classification] = TextureLoader.loadTexture(gl, normalized, { mipmaps: true });
		frametracker.onVisualChange(); // Draw it now that it's ready.
	} catch (e) {
		console.error(`Failed to build review badge texture for "${classification}"`, e);
		textureCache[classification] = null; // Give up; don't retry every frame.
	} finally {
		loading.delete(classification);
	}
}

/**
 * Resolves a classification's `--review-*` fill, always the dark-theme value regardless of the
 * page's active theme, via a throwaway `data-theme='dark'` probe — so CSS stays the single source
 * of truth. The board tiles behind the badge don't change with the light/dark theme, so its color
 * shouldn't either.
 */
function getDarkThemeReviewColor(classification: LapseKey): string {
	const probe = document.createElement('div');
	probe.setAttribute('data-theme', 'dark');
	probe.style.display = 'none';
	document.body.appendChild(probe);
	const fill = getComputedStyle(probe).getPropertyValue(`--review-${classification}`).trim();
	probe.remove();
	return fill;
}

/** Composes lila's badge SVG (circle + drop shadow + white glyph) for one classification. */
function buildBadgeSvg(fill: string, glyphPath: string): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}">` +
		'<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%">' +
		'<feDropShadow dx="4" dy="7" flood-opacity=".5" stdDeviation="5"/></filter></defs>' +
		`<circle cx="50" cy="50" r="50" fill="${fill}" filter="url(#s)"/>` +
		`<path fill="#fff" d="${glyphPath}"/>` +
		'</svg>'
	);
}
