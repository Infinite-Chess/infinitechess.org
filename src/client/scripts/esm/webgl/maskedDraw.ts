// src/client/scripts/esm/webgl/maskedDraw.ts

/**
 * This module manages stencil-masked rendering.
 * Both "inclusion" and "exclusion" masks are supported.
 */

import { gl } from '../game/rendering/webgl.js';
import { ProgramManager } from './ProgramManager.js';

// Variables -------------------------------------------------------------------------------

let programManager: ProgramManager;

/**
 * Tracks how many times {@link execute} has been called this frame.
 * Each call gets its own isolated bit pair in the 8-bit stencil buffer (2 bits per call, 4
 * calls max), so old stencil values from one call can never contaminate a later call.
 *
 * When the budget is exhausted, {@link resetStencilBuffer} is called to zero all bits via a
 * full-screen draw call (safe on TBDR GPUs — stays in the render pass), then the index recycles.
 */
let stencilCallIndex: number = 0;

// Functions -------------------------------------------------------------------------------

/**
 * Must be called once after WebGL is initialized and the
 * ProgramManager is created, before any call to {@link execute}.
 */
function init(pm: ProgramManager): void {
	programManager = pm;
}

/**
 * Must be called once at the start of every frame, when clearing the screen.
 * Resets the stencil bit-pair index so each call gets a fresh pair this frame.
 */
function onFrameStart(): void {
	stencilCallIndex = 0;
}

/**
 * Resets all stencil bits to 0 using a full-screen draw call.
 *
 * Using `gl.clear(STENCIL_BUFFER_BIT)` mid-frame yields partial/torn frames on Chrome mobile.
 * This is believed to be because it forces a render-pass boundary on TBDR GPUs, causing tile
 * memory to be flushed to DRAM, which Chrome's compositor can read as a partial frame.
 * A full-screen draw call, by contrast, stays within the current render pass and tile memory, avoiding this issue.
 *
 * This is only called when the 4-call bit-pair budget is exhausted.
 */
function resetStencilBuffer(): void {
	programManager.get('post_pass').use();

	gl.enable(gl.STENCIL_TEST);
	gl.colorMask(false, false, false, false);
	gl.depthMask(false);
	gl.stencilMask(0xff);
	gl.stencilFunc(gl.ALWAYS, 0, 0xff);
	gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);

	gl.drawArrays(gl.TRIANGLES, 0, 6); // Full-screen quad via gl_VertexID (no VBO needed)

	gl.disable(gl.STENCIL_TEST);
	gl.colorMask(true, true, true, true);
	gl.depthMask(true);

	stencilCallIndex = 0; // Reset the call index since all bits are now zeroed
}

/**
 * Renders content using a flexible stencil mask.
 * Handles all stencil buffer state changes internally, ensuring a clean state before and after.
 * @param drawInclusionMaskFunc - A function that renders the INCLUSION ZONE MASK. The main scene will appear inside this zone.
 * @param drawExclusionMaskFunc - A function that renders the EXCLUSION ZONE MASK. The main scene will NOT appear inside this zone.
 * @param drawContentFunc - A function that renders the main scene content. Will be masked.
 * @param intersectionMode - Determines the behavior for intersections of the two mask types:
 * 							'and' => Main scene will only be drawn where the inclusion mask and inversion of the exclusion mask intersect.
 * 							'or' => Main scene will be drawn inside the inclusion mask and inversion of the exclusion mask.
 * 							Has no effect if only one mask type is provided.
 */
function execute(
	drawInclusionMaskFunc: Function | undefined,
	drawExclusionMaskFunc: Function | undefined,
	drawContentFunc: Function,
	intersectionMode: 'and' | 'or',
): void {
	if (!drawExclusionMaskFunc && !drawInclusionMaskFunc)
		throw Error('No mask functions provided.');

	/**
	 * Assign this call its own isolated bit pair in the 8-bit stencil buffer.
	 *
	 * We use 2 bits per call (supporting up to 4 calls/frame — we currently use up to 3).
	 * The bit pairs from different calls never overlap, so leftover stencil values from
	 * earlier calls are invisible to us because we only test/write bits within our own mask.
	 *
	 * Example  callIndex 0 → bitMask=0x03, exclusionBit=0x01, inclusionBit=0x02
	 *          callIndex 1 → bitMask=0x0C, exclusionBit=0x04, inclusionBit=0x08
	 *          callIndex 2 → bitMask=0x30, exclusionBit=0x10, inclusionBit=0x20
	 *
	 * If all 4 bit pairs are exhausted, {@link resetStencilBuffer} zeros the buffer via a
	 * full-screen draw call and the index recycles from 0.
	 */

	if (stencilCallIndex >= 4) resetStencilBuffer();

	const callIndex = stencilCallIndex++;
	const exclusionBit = 1 << (callIndex * 2); // e.g. 0x01, 0x04, 0x10
	const inclusionBit = 1 << (callIndex * 2 + 1); // e.g. 0x02, 0x08, 0x20
	const bitMask = exclusionBit | inclusionBit; // e.g. 0x03, 0x0C, 0x30

	// Enable the stencil test.
	gl.enable(gl.STENCIL_TEST);
	// We don't want the mask to be affected by depth.
	// WITHOUT THIS, sometimes the mask doesn't do its masking, because it
	// initially failed the depth test if something else is rendered in front of it!
	gl.disable(gl.DEPTH_TEST);

	try {
		// We want to write to the stencil buffer, but make the mask itself invisible.
		gl.colorMask(false, false, false, false); // Disable writing to the color buffer
		gl.depthMask(false); // Disable writing to the depth buffer
		// Only write to our assigned bit pair; bits from other calls are preserved.
		gl.stencilMask(bitMask);
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);

		// Draw the Masks

		if (intersectionMode === 'and') {
			drawInclusion();
			drawExclusion();
		} else {
			drawExclusion();
			drawInclusion();
		}

		function drawInclusion(): void {
			if (!drawInclusionMaskFunc) return;
			// Writes inclusionBit into our bit pair. The readMask in stencilFunc is
			// irrelevant here (ALWAYS passes regardless), but ref is what REPLACE stores.
			gl.stencilFunc(gl.ALWAYS, inclusionBit, bitMask);
			drawInclusionMaskFunc();
		}
		function drawExclusion(): void {
			if (!drawExclusionMaskFunc) return;
			// Writes exclusionBit into our bit pair.
			gl.stencilFunc(gl.ALWAYS, exclusionBit, bitMask);
			drawExclusionMaskFunc();
		}

		// Draw the Main Content

		// Re-enable drawing to the screen.
		gl.colorMask(true, true, true, true);
		gl.depthMask(true);
		// During content draw, don't write to the stencil; only test against our bit pair.
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

		if (drawExclusionMaskFunc && drawInclusionMaskFunc) {
			// Case: COMPOSITE MASK (both exclusion and inclusion masks provided)
			if (intersectionMode === 'or') {
				// Draw where our bit pair is NOT set to exclusionBit (i.e. 0 or inclusionBit).
				gl.stencilFunc(gl.NOTEQUAL, exclusionBit, bitMask);
			} else {
				// Draw where our bit pair is exactly inclusionBit (not 0, not exclusionBit).
				gl.stencilFunc(gl.EQUAL, inclusionBit, bitMask);
			}
		} else if (drawExclusionMaskFunc) {
			// Case: EXCLUSION ONLY. Draw where our bit pair is not exclusionBit (i.e. 0).
			gl.stencilFunc(gl.NOTEQUAL, exclusionBit, bitMask);
		} else if (drawInclusionMaskFunc) {
			// Case: INCLUSION ONLY. Draw where our bit pair is inclusionBit.
			gl.stencilFunc(gl.EQUAL, inclusionBit, bitMask);
		} else throw Error('Unexpected!');

		drawContentFunc();
	} finally {
		// Return to a normal state.
		gl.disable(gl.STENCIL_TEST);
		gl.enable(gl.DEPTH_TEST);
	}
}

// Exports -----------------------------------------------------------------

export default { init, onFrameStart, execute };
