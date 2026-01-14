// src/client/scripts/esm/game/gui/boardeditor/guistartenginegame.ts

/**
 * Manages the GUI popup window for the Start engine game button of the Board Editor
 */

import { players } from '../../../../../../shared/chess/util/typeutil';

import guifloatingwindow from './guifloatingwindow';
import eactions from '../../boardeditor/eactions';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter';

import type { Player } from '../../../../../../shared/chess/util/typeutil';
import type { TimeControl } from '../../../../../../shared/chess/util/metadata';

// Types -------------------------------------------------------------

interface EngineUIConfig {
	youAreColor: Player;
	TimeControl: TimeControl;
}

// Constants ----------------------------------------------------------

const timeControlRegex = new RegExp(
	String.raw`^${icnconverter.wholeNumberSource}\+${icnconverter.wholeNumberSource}$`,
);

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start engine game popup window. */
const element_enginegamebutton = document.getElementById('start-engine-game')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('engine-game-UI')!;
const element_header = document.getElementById('engine-game-UI-header')!;
const element_closeButton = document.getElementById('close-engine-game-UI')!;

const yesButton = document.getElementById('start-engine-game-yes')!;
const noButton = document.getElementById('start-engine-game-no')!;

const element_white = document.getElementById('engine-game-white')! as HTMLInputElement;
const element_black = document.getElementById('engine-game-black')! as HTMLInputElement;
const element_timecontrol = document.getElementById('engine-game-timecontrol')! as HTMLInputElement;

const elements_selectionList: HTMLInputElement[] = [
	element_white,
	element_black,
	element_timecontrol,
];

// Running variables ------------------------------------------------------------

/** Virtual game rules object for the position */
let engineUIConfig: EngineUIConfig = {
	youAreColor: players.WHITE,
	TimeControl: '-',
};

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_enginegamebutton,
	closeButtonEl: element_closeButton,
	inputElList: elements_selectionList,
	onOpen: initEngineGameUIListeners,
	onClose: closeEngineGameUIListeners,
});

// Enginegame-UI-specific listeners -------------------------------------------

function initEngineGameUIListeners(): void {
	elements_selectionList.forEach((el) => {
		el.addEventListener('blur', readEngineUIConfig);
	});
	yesButton.addEventListener('pointerup', onYesButtonPress);
	noButton.addEventListener('pointerup', onNoButtonPress);
}

function closeEngineGameUIListeners(): void {
	elements_selectionList.forEach((el) => {
		el.removeEventListener('blur', readEngineUIConfig);
	});
	yesButton.removeEventListener('pointerup', onYesButtonPress);
	noButton.removeEventListener('pointerup', onNoButtonPress);
}

// Utilities---- -----------------------------------------------------------------

function onYesButtonPress(): void {
	eactions.startEngineGame(engineUIConfig.youAreColor, engineUIConfig.TimeControl);
}

function onNoButtonPress(): void {
	floatingWindow.close();
}

/** Initializes the engineconfig UI values to default values */
function initEngineUIcontents(): void {
	element_white.checked = true;
	element_black.checked = false;
	element_timecontrol.value = '';
	element_timecontrol.classList.remove('invalid-input');

	engineUIConfig = { youAreColor: players.WHITE, TimeControl: '-' };
}

/** Reads the engineconfig inserted into the input boxes and updates engineUIConfig */
function readEngineUIConfig(): void {
	console.log('hi');
	// color
	const youAreColor = element_white.checked ? players.WHITE : players.BLACK;

	// time control
	let TimeControl: TimeControl = '-';
	const timeControlRaw = element_timecontrol.value;
	if (timeControlRaw === '-' || timeControlRaw === '') {
		element_timecontrol.classList.remove('invalid-input');
	} else if (timeControlRegex.test(timeControlRaw)) {
		const [a, b] = timeControlRaw.split('+').map(Number);
		if (a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b)) {
			TimeControl = `${a}+${b}`;
			element_timecontrol.classList.remove('invalid-input');
		} else {
			element_timecontrol.classList.add('invalid-input');
		}
	} else {
		element_timecontrol.classList.add('invalid-input');
	}

	engineUIConfig = { youAreColor, TimeControl };
}

// Exports -----------------------------------------------------------------

export default {
	closeEngineGameUI: floatingWindow.close,
	toggleEngineGameUI: floatingWindow.toggle,
	resetPositioning: floatingWindow.resetPositioning,
	initEngineUIcontents,
};
