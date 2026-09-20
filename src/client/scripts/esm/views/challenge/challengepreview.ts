// src/client/scripts/esm/views/challenge/challengepreview.ts

/**
 * Draws the challenge's start position into the card's preview canvas, from White's view.
 *
 * The page's only asynchronous, asset-loading, WebGL-owning part.
 */

import type { SeekVariant } from '../../../../../shared/chess/util/variantselection.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';

import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';

import previewboards from '../../board/previewboards.js';
import previewrenderer from '../../board/rendering/previewrenderer.js';

// Elements --------------------------------------------------------------------

const element_preview = document.getElementById('challenge-preview') as HTMLCanvasElement;

// Init ------------------------------------------------------------------------

void draw();

// Functions -------------------------------------------------------------------

/**
 * Draws the challenge's start position into the preview canvas, and at every canvas
 * resize — a preview camera wires no resize listeners of its own.
 *
 * The canvas is SSR'd hidden for the reason `createContext` gives. `visibility`, not
 * `display`, so the card never reflows and the canvas keeps a width to draw at.
 */
async function draw(): Promise<void> {
	const boardsim = await buildBoard(window.challengePageData.variant);
	const ctx = await previewrenderer.createContext(element_preview);
	await previewrenderer.load(ctx, boardsim);

	// A ResizeObserver reports the canvas's starting size too, so its first
	// callback is what performs the initial draw. Revealing is idempotent.
	new ResizeObserver(() => {
		previewrenderer.render(ctx, boardsim);
		element_preview.classList.remove('visibility-hidden');
	}).observe(element_preview);
}

/** Builds the seek's start position: a preset's, or its custom ICN's. */
async function buildBoard(variant: SeekVariant): Promise<BoardPreview> {
	if (variant.kind === 'preset') {
		return previewboards.ofPreset(variant.code);
	} else {
		// Seeks are server-validated to always include an explicit position.
		const longFormat = icnconverter.ShortToLong_Format(variant.position);
		const variantOptions = icnimport.variantOptionsFromLongFormat(longFormat);
		return previewboards.ofPosition(variantOptions);
	}
}
