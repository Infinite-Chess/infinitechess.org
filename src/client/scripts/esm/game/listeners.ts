// src/client/scripts/esm/game/listeners.ts

/**
 * The interactive board's canvas element, and the two input listeners reading it: one
 * attached to the canvas, one to the document.
 *
 * The two listeners are live bindings, undefined until {@link init} runs, so importers may
 * hold a reference from module scope and still see the real listener once the page boots.
 */

import { CreateInputListener, InputListener } from './input.js';

// State -----------------------------------------------------------------------

let element_canvas: HTMLCanvasElement;
/** The input listener for the board canvas. */
let listener_canvas: InputListener;
/** The input listener for the document element. */
let listener_document: InputListener;

// Functions -------------------------------------------------------------------

/** Attaches both input listeners. Call once, before anything reads them. */
function init(canvas: HTMLCanvasElement): void {
	element_canvas = canvas;
	listener_canvas = CreateInputListener(element_canvas, { keyboard: false });
	listener_document = CreateInputListener(document);
}

/** Returns the overlay element covering the entire canvas. */
function getCanvas(): HTMLElement {
	return element_canvas;
}

/** Whether either listener saw any input this frame. */
function atleastOneInput(): boolean {
	return listener_document.atleastOneInput() || listener_canvas.atleastOneInput();
}

// Exports ---------------------------------------------------------------------

export default {
	init,
	getCanvas,
	atleastOneInput,
};

export { listener_canvas, listener_document };
