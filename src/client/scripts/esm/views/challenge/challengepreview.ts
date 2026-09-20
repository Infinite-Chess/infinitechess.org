// src/client/scripts/esm/views/challenge/challengepreview.ts

/**
 * Draws the challenge's start position into the card's preview canvas, from White's view.
 */

import type { SeekVariant } from '../../../../../shared/chess/util/variantselection.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';

import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';

import previewboards from '../../board/previewboards.js';
import { SettingsBus } from '../../util/SettingsBus.js';
import previewrenderer from '../../board/rendering/previewrenderer.js';

// Elements --------------------------------------------------------------------

const element_preview = document.getElementById('challenge-preview') as HTMLCanvasElement;

// Init ------------------------------------------------------------------------

void init();

// Functions -------------------------------------------------------------------

/**
 * Loads the preview, then draws it at every size and theme it is shown at. Visibility stays hidden
 * until the first draw, reserving layout space and measurable canvas dimensions while loading.
 */
async function init(): Promise<void> {
	const boardsim = await buildBoard(window.challengePageData.variant);
	const ctx = await previewrenderer.createContext(element_preview);
	await previewrenderer.load(ctx, boardsim);

	const draw = (): void => {
		previewrenderer.render(ctx, boardsim);
		element_preview.classList.remove('visibility-hidden');
	};

	// ResizeObserver also delivers the initial size, triggering the first draw.
	new ResizeObserver(draw).observe(element_preview);

	// The tiles regenerate their textures on a theme change, but only a render loop would
	// pick that up — this board has none, so it redraws itself once the new ones land.
	SettingsBus.addEventListener('theme-change', () => void ctx.boardtiles.ready().then(draw));
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
