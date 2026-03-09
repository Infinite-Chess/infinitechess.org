// src/client/scripts/esm/game/gui/boardeditor/guiboardeditor.ts

/**
 * Manages the board editor GUI lifecycle: opening, closing,
 * the sidebar menu toggle, and dispatching action button events.
 */

import type { MetaData } from '../../../../../../shared/chess/util/metadata.js';

import timeutil from '../../../../../../shared/util/timeutil.js';

import esave from '../../boardeditor/actions/esave.js';
import ecloud from '../../boardeditor/actions/ecloud.js';
import gameslot from '../../chess/gameslot.js';
import eactions from '../../boardeditor/actions/eactions.js';
import eautosave from '../../boardeditor/actions/eautosave.js';
import gameloader from '../../chess/gameloader.js';
import guitoolbar from './guitoolbar.js';
import guipalette from './guipalette.js';
import boardeditor from '../../boardeditor/boardeditor.js';
import guigamerules from './actions/guigamerules.js';
import selectiontool from '../../boardeditor/tools/selection/selectiontool.js';
import guiloadposition from './actions/loadposition/guiloadposition.js';
import stransformations from '../../boardeditor/tools/selection/stransformations.js';
import guiresetposition from './actions/guiresetposition.js';
import guiclearposition from './actions/guiclearposition.js';
import guistartlocalgame from './actions/guistartlocalgame.js';
import guistartenginegame from './actions/guistartenginegame.js';
import guiloadpositionsavelist from './actions/loadposition/guiloadpositionsavelist.js';

// Elements ---------------------------------------------------------------

const element_menu = document.getElementById('editor-menu')!;
const element_menuToggle = document.getElementById('editor-menu-toggle')!;

const elements_actions = [
	// Position
	document.getElementById('reset')!,
	document.getElementById('clearall')!,
	document.getElementById('load-position')!,
	document.getElementById('save-position-as')!,
	document.getElementById('save-position')!,
	document.getElementById('copy-notation')!,
	document.getElementById('paste-notation')!,
	document.getElementById('gamerules')!,
	document.getElementById('start-local-game')!,
	document.getElementById('start-engine-game')!,
	// Selection
	document.getElementById('select-all')!,
	document.getElementById('delete-selection')!,
	document.getElementById('copy-selection')!,
	document.getElementById('paste-selection')!,
	document.getElementById('invert-color')!,
	document.getElementById('rotate-left')!,
	document.getElementById('rotate-right')!,
	document.getElementById('flip-horizontal')!,
	document.getElementById('flip-vertical')!,
	// Palette
	document.getElementById('editor-color-select')!,
];

// State -------------------------------------------------------------------

/** Whether the board editor UI is open. */
let boardEditorOpen = false;

// Functions ---------------------------------------------------------------

/**
 * Open the board editor GUI
 */
async function open(): Promise<void> {
	boardEditorOpen = true;
	element_menu.classList.remove('hidden');
	window.dispatchEvent(new CustomEvent('resize')); // the screen and canvas get effectively resized when the vertical board editor bar is toggled

	// Try to read in autosave and initialize board editor
	// If there is no autosave, initialize board editor with Classical position
	const autoSaveState = await eautosave.loadAutosave();

	if (autoSaveState === undefined) {
		boardeditor.clearActivePosition();
		await gameloader.startBoardEditor();
	} else {
		const metadata: MetaData = {
			Variant: 'Classical',
			TimeControl: '-',
			Event: `Position created using ingame board editor`,
			Site: 'https://www.infinitechess.org/',
			Round: '-',
			UTCDate: timeutil.getCurrentUTCDate(),
			UTCTime: timeutil.getCurrentUTCTime(),
		};

		if (autoSaveState.active_position !== undefined)
			boardeditor.setActivePosition(
				autoSaveState.active_position.name,
				autoSaveState.active_position.storage_type,
			);
		else boardeditor.clearActivePosition();

		await gameloader.startBoardEditorFromCustomPosition(
			{
				metadata,
				additional: {
					variantOptions: autoSaveState.variantOptions,
				},
			},
			autoSaveState.dirty,
			autoSaveState.pawnDoublePush,
			autoSaveState.castling,
		);
	}

	initListeners();
}

/** Whether the board editor UI is open. */
function isOpen(): boolean {
	return boardEditorOpen;
}

function close(): void {
	if (!boardEditorOpen) return;

	closeAllFloatingWindows(true);

	element_menu.classList.remove('expanded');
	element_menu.classList.add('hidden');
	window.dispatchEvent(new CustomEvent('resize')); // The screen and canvas get effectively resized when the vertical board editor bar is toggled
	closeListeners();
	boardEditorOpen = false;
}

function initListeners(): void {
	element_menuToggle.addEventListener('click', callback_ToggleMenu);
	elements_actions.forEach((element) => {
		element.addEventListener('click', callback_Action);
	});
	guitoolbar.initListeners();
	guipalette.initListeners();
}

function closeListeners(): void {
	element_menuToggle.removeEventListener('click', callback_ToggleMenu);
	elements_actions.forEach((element) => {
		element.removeEventListener('click', callback_Action);
	});
	guitoolbar.closeListeners();
	guipalette.closeListeners();
}

/** Close and reset the positioning and contents of all floating windows */
function closeAllFloatingWindows(resetPositioning: boolean): void {
	guiresetposition.close(resetPositioning);
	guiclearposition.close(resetPositioning);
	guiloadposition.close(resetPositioning);
	guigamerules.close(resetPositioning);
	guistartlocalgame.close(resetPositioning);
	guistartenginegame.close(resetPositioning);
}

// Callbacks ---------------------------------------------------------------

function callback_ToggleMenu(): void {
	setSidebarExpanded(!element_menu.classList.contains('expanded'));
}

/**
 * Sets the sidebar expanded/collapsed state, correctly updating all related elements:
 * the `expanded` class on the menu, the tooltip text, and the tooltip direction classes.
 */
function setSidebarExpanded(expanded: boolean): void {
	element_menu.classList.toggle('expanded', expanded);
	element_menuToggle.setAttribute(
		'data-tooltip',
		expanded ? translations.editor.collapse_sidebar : translations.editor.expand_sidebar,
	);
	element_menuToggle.classList.toggle('tooltip-dr', !expanded);
	element_menuToggle.classList.toggle('tooltip-d', expanded);
}

function callback_Action(e: Event): void {
	const target = e.currentTarget as HTMLElement;
	const action = target.getAttribute('data-action');

	// Position/Palette actions...

	switch (action) {
		// Position ---------------------
		case 'reset': {
			const wasOpen = guiresetposition.isOpen();
			closeAllFloatingWindows(false);
			// Skip confirmation dialog if there are no unsaved changes
			if (!boardeditor.isPositionDirty()) eactions.reset();
			else if (!wasOpen) guiresetposition.open();
			return;
		}
		case 'clearall': {
			const wasOpen = guiclearposition.isOpen();
			closeAllFloatingWindows(false);
			// Skip confirmation dialog if there are no unsaved changes
			if (!boardeditor.isPositionDirty()) eactions.clearAll();
			else if (!wasOpen) guiclearposition.open();
			return;
		}
		case 'load-position': {
			const wasOpen = guiloadposition.getMode() !== 'load';
			closeAllFloatingWindows(false);
			if (wasOpen) guiloadposition.openLoadPosition();
			return;
		}
		case 'save-position-as': {
			const wasOpen = guiloadposition.getMode() !== 'save-as';
			closeAllFloatingWindows(false);
			if (wasOpen) guiloadposition.openSavePositionAs();
			return;
		}
		case 'save-position': {
			const active_position = boardeditor.getActivePosition();
			if (active_position === undefined) {
				// If there is no active position name, treat this the same way as "Save as" if that window is not open
				const wasOpen = guiloadposition.getMode() !== 'save-as';
				if (wasOpen) {
					closeAllFloatingWindows(false);
					guiloadposition.openSavePositionAs();
				}
			} else {
				// If there is an active position name, simply overwrite save
				if (active_position.storage_type === 'cloud') {
					// If it's a cloud save, upload to cloud (which will overwrite)
					ecloud.saveCloud(active_position.name);
				} else {
					// If it's a local save, simply overwrite in IndexedDB
					esave.saveLocal(active_position.name);
				}

				// Update UI if necessary
				if (guiloadposition.getMode() !== undefined)
					guiloadpositionsavelist.updateSavedPositionListUI();
			}
			return;
		}
		case 'copy-notation':
			eactions.copy();
			return;
		case 'paste-notation':
			eactions.paste();
			return;
		case 'gamerules': {
			const wasOpen = guigamerules.isOpen();
			closeAllFloatingWindows(false);
			if (!wasOpen) guigamerules.open();
			return;
		}
		case 'start-local-game': {
			const wasOpen = guistartlocalgame.isOpen();
			closeAllFloatingWindows(false);
			if (!wasOpen) guistartlocalgame.open();
			return;
		}
		case 'start-engine-game': {
			const wasOpen = guistartenginegame.isOpen();
			closeAllFloatingWindows(false);
			if (!wasOpen) guistartenginegame.open();
			return;
		}
		// Selection (buttons that are always active)
		case 'select-all':
			selectiontool.selectAll();
			return;
		// Palette ---------------------
		case 'color':
			guipalette.nextColor();
			return;
	}

	// Selection actions...

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const selectionBox = selectiontool.getSelectionIntBox();
	if (!selectionBox) return; // Might have clicked action button when there was no selection.

	switch (action) {
		case 'delete-selection':
			stransformations.Delete(gamefile, mesh, selectionBox);
			break;
		case 'copy-selection':
			stransformations.Copy(gamefile, selectionBox);
			break;
		case 'paste-selection':
			stransformations.Paste(gamefile, mesh, selectionBox);
			break;
		case 'invert-color':
			stransformations.InvertColor(gamefile, mesh, selectionBox);
			break;
		case 'rotate-left':
			stransformations.RotateLeft(gamefile, mesh, selectionBox);
			break;
		case 'rotate-right':
			stransformations.RotateRight(gamefile, mesh, selectionBox);
			break;
		case 'flip-horizontal':
			stransformations.FlipHorizontal(gamefile, mesh, selectionBox);
			break;
		case 'flip-vertical':
			stransformations.FlipVertical(gamefile, mesh, selectionBox);
			break;
		default:
			console.error(`Unknown action: ${action}`);
	}
}

// Exports ----------------------------------------------------------------

export default {
	open,
	isOpen,
	close,
	setSidebarExpanded,
};
