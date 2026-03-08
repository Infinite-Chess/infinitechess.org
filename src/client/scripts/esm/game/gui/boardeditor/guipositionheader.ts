// src/client/scripts/esm/game/gui/boardeditor/guipositionheader.ts

/**
 * Manages the active position name display, the dirty indicator,
 * and the enabled/disabled state of selection action buttons
 * in the board editor GUI.
 */

// Elements ---------------------------------------------------------------

const element_activePositionNameDisplay = document.getElementById('active-position-name-display')!;
const element_dirtyIndicator = document.getElementById('position-dirty-indicator')!;

/** The element containing all selection tool action buttons. */
const element_selectionActions = document.getElementsByClassName(
	'selection-actions',
)[0]! as HTMLElement;
/** These selection action buttons are always enabled. */
const alwaysActiveSelectionActions = [document.getElementById('select-all')!];

// Functions ---------------------------------------------------------------

/** Updates the displayed active position name. */
function updateActivePositionElement(positionname: string | undefined): void {
	if (positionname === undefined) {
		positionname = 'New position';
		element_activePositionNameDisplay.classList.add('italic');
	} else {
		element_activePositionNameDisplay.classList.remove('italic');
	}

	element_activePositionNameDisplay.textContent = positionname;
	element_activePositionNameDisplay.title = positionname;
}

/** Shows or hides the dirty indicator dot next to the position name. */
function updateDirtyIndicator(dirty: boolean): void {
	if (dirty) element_dirtyIndicator.classList.remove('hidden');
	else element_dirtyIndicator.classList.add('hidden');
}

/** Un-greys selection action buttons when a selection is made. */
function onNewSelection(): void {
	Array.from(element_selectionActions.children).forEach((child) => {
		(child as HTMLElement).classList.remove('disabled');
	});
}

/** Greys out selection action buttons when the selection is cleared. */
function onClearSelection(): void {
	Array.from(element_selectionActions.children).forEach((child) => {
		if (!alwaysActiveSelectionActions.includes(child as HTMLElement)) {
			(child as HTMLElement).classList.add('disabled');
		}
	});
}

// Exports ----------------------------------------------------------------

export default {
	updateActivePositionElement,
	updateDirtyIndicator,
	onNewSelection,
	onClearSelection,
};
