// src/client/scripts/esm/game/gui/boardeditor/tools/guitoolbar.ts

/**
 * Manages the tool selection toolbar in the board editor GUI.
 * Handles marking the active tool and wiring up tool-change click listeners.
 */

import type { Tool } from '../../../boardeditor/tools/etoolmanager.js';

import etoolmanager from '../../../boardeditor/tools/etoolmanager.js';

// Elements ---------------------------------------------------------------

const elements_tools = [
	document.getElementById('normal')!,
	document.getElementById('eraser')!,
	document.getElementById('specialrights')!,
	document.getElementById('selection-tool')!,
];

// Functions ---------------------------------------------------------------

/** Adds/removes the 'active' class from the tools, changing their style. */
function markTool(tool: Tool): void {
	elements_tools.forEach((element) => {
		const element_tool = element.getAttribute('data-tool');
		if (element_tool === tool) element.classList.add('active');
		else if (element_tool !== 'gamerules') element.classList.remove('active');
	});
}

function initListeners(): void {
	elements_tools.forEach((element) => {
		element.addEventListener('click', callback_ChangeTool);
	});
}

function closeListeners(): void {
	elements_tools.forEach((element) => {
		element.removeEventListener('click', callback_ChangeTool);
	});
}

// Callbacks ---------------------------------------------------------------

function callback_ChangeTool(e: Event): void {
	const target = e.currentTarget as HTMLElement;
	const tool = target.getAttribute('data-tool');
	if (tool === null) throw new Error('Tool attribute is null');
	etoolmanager.setTool(tool);
}

// Exports ----------------------------------------------------------------

export default {
	markTool,
	initListeners,
	closeListeners,
};
