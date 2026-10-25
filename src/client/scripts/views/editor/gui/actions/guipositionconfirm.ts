// src/client/scripts/views/editor/gui/actions/guipositionconfirm.ts

/**
 * The Board Editor's confirmation popups for its two destructive position actions, resetting
 * to the Classical position and clearing the board: Yes (or Enter) confirms, No (or Escape)
 * cancels.
 */

import eactions from '../../actions/eactions.js';
import guifloatingwindow from '../guifloatingwindow.js';
import { listener_document } from '../../../../game/listeners.js';

// Types -----------------------------------------------------------------------

/** A confirmation popup's name, which prefixes its element ids. */
type ConfirmName = 'reset' | 'clear';

/** The handle the editor opens and closes a confirmation popup through. */
interface ConfirmWindow {
	open: () => void;
	close: (resetPositioning: boolean) => void;
	isOpen: () => boolean;
}

// Functions -------------------------------------------------------------------

/**
 * Builds the confirmation popup whose element ids are prefixed by `name`, highlighting the
 * action button `actionButtonId` while open, and running `onConfirm` on Yes.
 */
function createConfirmWindow(
	name: ConfirmName,
	actionButtonId: string,
	onConfirm: () => void,
): ConfirmWindow {
	const element_actionButton = document.getElementById(actionButtonId)!;
	const element_yes = document.getElementById(`${name}-position-yes`)!;
	const element_no = document.getElementById(`${name}-position-no`)!;

	const floatingWindow = guifloatingwindow.create({
		windowEl: document.getElementById(`${name}-position-UI`)!,
		headerEl: document.getElementById(`${name}-position-UI-header`)!,
		closeButtonEl: document.getElementById(`close-${name}-position-UI`)!,
		onOpen,
		onClose,
	});

	/** Highlights the action button and listens for an answer. */
	function onOpen(): void {
		element_actionButton.classList.add('active');
		element_yes.addEventListener('click', accept);
		element_no.addEventListener('click', cancel);
		document.addEventListener('keydown', onKeyDown);
	}

	/** Undoes {@link onOpen}, also resetting the window's position if asked. */
	function onClose(resetPositioning: boolean): void {
		if (resetPositioning) floatingWindow.resetPositioning();
		element_actionButton.classList.remove('active');
		element_yes.removeEventListener('click', accept);
		element_no.removeEventListener('click', cancel);
		document.removeEventListener('keydown', onKeyDown);
	}

	/** Enter accepts, Escape cancels. */
	function onKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Enter') accept();
		else if (e.key === 'Escape') {
			listener_document.claimKey('Escape');
			cancel();
		}
	}

	/** Runs the action, then closes. */
	function accept(): void {
		onConfirm();
		floatingWindow.close(false);
	}

	/** Closes without running the action. */
	function cancel(): void {
		floatingWindow.close(false);
	}

	return {
		open: floatingWindow.open,
		close: floatingWindow.close,
		isOpen: floatingWindow.isOpen,
	};
}

// Exports ---------------------------------------------------------------------

export default {
	reset: createConfirmWindow('reset', 'reset', () => eactions.reset()),
	clear: createConfirmWindow('clear', 'clearall', () => eactions.clearAll()),
};
