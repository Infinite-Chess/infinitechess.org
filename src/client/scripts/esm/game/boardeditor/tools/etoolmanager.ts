// src/client/scripts/esm/game/boardeditor/tools/etoolmanager.ts

/**
 * Tool Manager for the Board Editor.
 *
 * Tracks the currently selected tool, handles tool switching,
 * keyboard shortcuts, and pointer reservation.
 */

import selection from '../../chess/selection.js';
import drawingtool from './drawingtool.js';
import perspective from '../../rendering/perspective.js';
import boardeditor from '../boardeditor.js';
import edithistory from '../edithistory.js';
import selectiontool from './selection/selectiontool.js';
import guiboardeditor from '../../gui/boardeditor/guiboardeditor.js';
import { listener_document } from '../../chess/game.js';

// Types ----------------------------------------------------------------------

export type Tool = (typeof validTools)[number];

// Constants ------------------------------------------------------------------

/** All tools that can be used in the board editor. */
const validTools = ['normal', 'placer', 'eraser', 'specialrights', 'selection-tool'] as const;

// State ----------------------------------------------------------------------

/** The tool currently selected. */
let currentTool: Tool = 'normal';

// Initialization -------------------------------------------------------------

/** Resets the tool state when the board editor is closed. */
function reset(): void {
	currentTool = 'normal';
	guiboardeditor.markTool(currentTool); // Effectively resets classes state
}

// Tool Management ------------------------------------------------------------

/** Returns the currently active tool. */
function getTool(): Tool {
	return currentTool;
}

/** Changes the active tool. */
function setTool(tool: string): void {
	if (!validTools.includes(tool as Tool)) return console.error('Invalid tool: ' + tool);
	currentTool = tool as Tool;
	drawingtool.onToolChange(currentTool);

	// Prevents you from being able to draw while a piece is selected.
	// Should this not always unselect when moving off the "normal" tool?
	// Buttons that perform one-time actions like "clear" or "reset" should not be treated as tools.
	selection.unselectPiece();

	guiboardeditor.markTool(currentTool);

	// Reset selection tool state when switching to another tool
	selectiontool.resetState();
}

/** Whether any of the editor tools are actively using the left mouse button. */
function isLeftMouseReserved(): boolean {
	if (!boardeditor.areInBoardEditor()) return false;
	return drawingtool.isToolADrawingTool(currentTool) || currentTool === 'selection-tool';
}

/** If the given pointer is currently being used by a drawing tool for an edit, this stops using it. */
function stealPointer(pointerIdToSteal: string): void {
	if (!boardeditor.areInBoardEditor()) return;
	if (currentTool === 'selection-tool')
		return; // Don't steal (selection tool isn't capable of reverting to previous selection before starting a new one)
	else if (drawingtool.isToolADrawingTool(currentTool))
		drawingtool.stealPointer(pointerIdToSteal);
}

// Shortcuts ------------------------------------------------------------------

/** Tests for keyboard shortcuts in the board editor. */
function testShortcuts(): void {
	if (perspective.getEnabled()) return; // Disable shortcuts while in perspective mode, WASD is reserved for camera movement

	// Select all
	if (listener_document.isKeyDown('KeyA', true)) selectiontool.selectAll();

	// Undo/Redo
	if (listener_document.isKeyDown('KeyY', true)) edithistory.redo();
	if (listener_document.isKeyDown('KeyZ', true, true))
		edithistory.redo(); // Also requires shift key
	else if (listener_document.isKeyDown('KeyZ', true)) edithistory.undo();

	// Tools
	if (listener_document.isKeyDown('KeyF')) setTool('normal');
	else if (listener_document.isKeyDown('KeyG')) setTool('eraser');
	else if (listener_document.isKeyDown('KeyH')) setTool('selection-tool');
	else if (listener_document.isKeyDown('KeyJ')) setTool('specialrights');
	else if (listener_document.isKeyDown('KeyK')) setTool('placer');
}

// Exports --------------------------------------------------------------------

export default {
	// Initialization
	reset,
	// Tool Management
	getTool,
	setTool,
	isLeftMouseReserved,
	stealPointer,
	// Shortcuts
	testShortcuts,
};
